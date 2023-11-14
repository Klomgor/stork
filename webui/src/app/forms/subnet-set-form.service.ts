import { Injectable } from '@angular/core'
import {
    AbstractControl,
    FormArray,
    FormControl,
    FormGroup,
    UntypedFormArray,
    UntypedFormControl,
    UntypedFormGroup,
    Validators,
} from '@angular/forms'
import { SharedParameterFormGroup } from './shared-parameter-form-group'
import { KeaConfigPoolParameters, KeaConfigSubnetDerivedParameters, LocalSubnet, Pool, Subnet } from '../backend'
import { StorkValidators } from '../validators'
import { DhcpOptionSetFormService } from './dhcp-option-set-form.service'
import { IPType } from '../iptype'
import { extractUniqueSubnetPools, hasDifferentLocalPoolOptions, hasDifferentSubnetLevelOptions } from '../subnets'
import { AddressRange } from '../address-range'
import { GenericFormService } from './generic-form.service'

/**
 * An interface to a {@link LocalSubnet}, {@link LocalPool} etc.
 */
interface LocalDaemonData {
    daemonId?: number
}

/**
 * A type of a form holding DHCP options.
 */
export interface OptionsForm {
    unlocked: FormControl<boolean>
    data: UntypedFormArray
}

/**
 * A type of the form for editing Kea-specific pool parameters using
 * the {@link SharedParametersForm} component.
 */
export interface KeaPoolParametersForm {
    clientClass?: SharedParameterFormGroup<string>
    requireClientClasses?: SharedParameterFormGroup<string[]>
}

/**
 * A type of the subnet form for editing Kea-specific parameters using
 * the {@link SharedParametersForm} component.
 */
export interface KeaSubnetParametersForm {
    cacheMaxAge?: SharedParameterFormGroup<number>
    cacheThreshold?: SharedParameterFormGroup<number>
    clientClass?: SharedParameterFormGroup<string>
    requireClientClasses?: SharedParameterFormGroup<string[]>
    ddnsGeneratedPrefix?: SharedParameterFormGroup<string>
    ddnsOverrideClientUpdate?: SharedParameterFormGroup<boolean>
    ddnsOverrideNoUpdate?: SharedParameterFormGroup<boolean>
    ddnsQualifyingSuffix?: SharedParameterFormGroup<string>
    ddnsReplaceClientName?: SharedParameterFormGroup<string>
    ddnsSendUpdates?: SharedParameterFormGroup<boolean>
    ddnsUpdateOnRenew?: SharedParameterFormGroup<boolean>
    ddnsUseConflictResolution?: SharedParameterFormGroup<boolean>
    fourOverSixInterface?: SharedParameterFormGroup<string>
    fourOverSixInterfaceID?: SharedParameterFormGroup<string>
    fourOverSixSubnet?: SharedParameterFormGroup<string>
    hostnameCharReplacement?: SharedParameterFormGroup<string>
    hostnameCharSet?: SharedParameterFormGroup<string>
    preferredLifetime?: SharedParameterFormGroup<number>
    minPreferredLifetime?: SharedParameterFormGroup<number>
    maxPreferredLifetime?: SharedParameterFormGroup<number>
    reservationsGlobal?: SharedParameterFormGroup<boolean>
    reservationsInSubnet?: SharedParameterFormGroup<boolean>
    reservationsOutOfPool?: SharedParameterFormGroup<boolean>
    renewTimer?: SharedParameterFormGroup<number>
    rebindTimer?: SharedParameterFormGroup<number>
    t1Percent?: SharedParameterFormGroup<number>
    t2Percent?: SharedParameterFormGroup<number>
    calculateTeeTimes?: SharedParameterFormGroup<boolean>
    validLifetime?: SharedParameterFormGroup<number>
    minValidLifetime?: SharedParameterFormGroup<number>
    maxValidLifetime?: SharedParameterFormGroup<number>
    allocator?: SharedParameterFormGroup<string>
    authoritative?: SharedParameterFormGroup<boolean>
    bootFileName?: SharedParameterFormGroup<string>
    interface?: SharedParameterFormGroup<string>
    interfaceID?: SharedParameterFormGroup<string>
    matchClientID?: SharedParameterFormGroup<boolean>
    nextServer?: SharedParameterFormGroup<string>
    pdAllocator?: SharedParameterFormGroup<string>
    rapidCommit?: SharedParameterFormGroup<boolean>
    serverHostname?: SharedParameterFormGroup<string>
    storeExtendedInfo?: SharedParameterFormGroup<boolean>
}

/**
 * A form group for editing pool address range.
 */
export interface AddressRangeForm {
    /**
     * Lower pool boundary.
     */
    start?: FormControl<string>

    /**
     * Upper pool boundary.
     */
    end?: FormControl<string>
}

/**
 * A form for editing an address pool.
 */
export interface AddressPoolForm {
    /**
     * Pool address range.
     */
    range?: FormGroup<AddressRangeForm>

    /**
     * Kea-specific parameters for a pool.
     */
    parameters?: FormGroup<KeaPoolParametersForm>

    /**
     * DHCP options in an address pool.
     */
    options?: FormGroup<OptionsForm>

    /**
     * Daemon IDs selected with a multi-select component.
     *
     * Selected daemons are associated with the pool.
     */
    selectedDaemons?: FormControl<number[]>
}

/**
 * An interface describing the form for editing a subnet.
 */
export interface SubnetForm {
    /**
     * Subnet prefix.
     */
    subnet?: FormControl<string>

    /**
     * An array of the address pools.
     */
    pools?: FormArray<FormGroup<AddressPoolForm>>

    /**
     * Kea-specific parameters for a subnet.
     */
    parameters?: FormGroup<KeaSubnetParametersForm>

    /**
     * DHCP options in a subnet.
     */
    options?: FormGroup<OptionsForm>

    /**
     * Daemon IDs selected with a multi-select component.
     *
     * Selected daemons are associated with the subnet.
     */
    selectedDaemons?: FormControl<number[]>
}

/**
 * A service exposing functions converting subnet data to a form and
 * vice versa.
 */
@Injectable({
    providedIn: 'root',
})
export class SubnetSetFormService {
    /**
     * Empty constructor.
     *
     * @param genericFormService a generic form service used to clone controls.
     * @param optionService a service for manipulating DHCP options.
     */
    constructor(
        private genericFormService: GenericFormService,
        private optionService: DhcpOptionSetFormService
    ) {}

    /**
     * Extract the index from the array by matching the daemon id.
     *
     * @param localData A {@link LocalSubnet} or {@link LocalPool} etc.
     * @param selectedDaemons an array with identifiers of the selected daemons.
     * @returns An index in the array.
     */
    private getDaemonIndex(localData: LocalDaemonData, selectedDaemons: number[]) {
        return selectedDaemons.findIndex((sd) => sd === localData.daemonId)
    }

    /**
     * Generic function converting a form to Kea-specific parameters.
     *
     * It can be used for different parameter sets, e.g. subnet-specific parameters,
     * pool-specific parameters etc.
     *
     * @typeParam FormType a type of the form holding the parameters.
     * @typeParam ParamsType a type of the parameter set returned by this function.
     * @param form a form group holding the parameters set by the {@link SharedParametersForm}
     * component.
     * @returns An array of the parameter sets.
     */
    private convertFormToKeaParameters<
        FormType extends { [K in keyof FormType]: AbstractControl<any, any> },
        ParamsType extends { [K in keyof ParamsType]: ParamsType[K] },
    >(form: FormGroup<FormType>): ParamsType[] {
        const params: ParamsType[] = []
        // Iterate over all parameters.
        for (let key in form.controls) {
            const unlocked = form.get(key).get('unlocked')?.value
            // Get the values of the parameter for different servers.
            const values = form.get(key).get('values') as UntypedFormArray
            // For each server-specific value of the parameter.
            for (let i = 0; i < values?.length; i++) {
                // If we haven't added the parameter set for the current index let's add one.
                if (params.length <= i) {
                    params.push({} as ParamsType)
                }
                // If the parameter is unlocked, there should be a value dedicated
                // for each server. Otherwise, we add the first (common) value.
                if (values.at(!!unlocked ? i : 0).value != null) {
                    params[i][key] = values.at(!!unlocked ? i : 0).value
                }
            }
        }
        return params
    }

    /**
     * Convert Kea pool parameters to a form.
     *
     * @param parameters Kea-specific pool parameters.
     * @returns Created form group instance.
     */
    convertKeaPoolParametersToForm(parameters: KeaConfigPoolParameters[]): FormGroup<KeaPoolParametersForm> {
        let form: KeaPoolParametersForm = {
            clientClass: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                },
                parameters?.map((params) => new FormControl<string>(params?.clientClass ?? null))
            ),
            requireClientClasses: new SharedParameterFormGroup<string[]>(
                {
                    type: 'client-classes',
                },
                parameters?.map((params) => new FormControl<string[]>(params?.requireClientClasses ?? []))
            ),
        }
        let formGroup = new FormGroup<KeaPoolParametersForm>(form)
        return formGroup
    }

    /**
     * Creates a default parameters form for an empty pool.
     *
     * @param ipType subnet universe (IPv4 or IPv6).
     * @returns A default form group for a subnet.
     */
    createDefaultKeaPoolParametersForm(): UntypedFormGroup {
        let parameters: KeaConfigPoolParameters[] = [{}]
        return this.convertKeaPoolParametersToForm(parameters)
    }

    /**
     * Creates a default form for an address pool.
     *
     * @param subnet subnet prefix.
     * @returns A default form group for an address pool.
     */
    createDefaultAddressPoolForm(subnet: string): FormGroup<AddressPoolForm> {
        let formGroup = new FormGroup<AddressPoolForm>({
            range: new FormGroup<AddressRangeForm>(
                {
                    start: new FormControl('', StorkValidators.ipInSubnet(subnet)),
                    end: new FormControl('', StorkValidators.ipInSubnet(subnet)),
                },
                StorkValidators.ipRangeBounds
            ),
            parameters: this.createDefaultKeaPoolParametersForm(),
            options: new FormGroup({
                unlocked: new FormControl(false),
                data: new UntypedFormArray([]),
            }),
            selectedDaemons: new FormControl([], Validators.required),
        })
        return formGroup
    }

    /**
     * Converts Kea subnet parameters to a form.
     *
     * The created form is used in the {@link SharedParametersForm} for editing
     * the subnet parameters. It comprises the metadata describing each parameter.
     *
     * @param ipType subnet universe (IPv4 or IPv6).
     * @param parameters Kea-specific subnet parameters.
     * @returns Created form group instance.
     */
    convertKeaSubnetParametersToForm(
        ipType: IPType,
        parameters: KeaConfigSubnetDerivedParameters[]
    ): FormGroup<KeaSubnetParametersForm> {
        // Common parameters.
        let form: KeaSubnetParametersForm = {
            cacheThreshold: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                    min: 0,
                    max: 1,
                    fractionDigits: 2,
                },
                parameters.map((params) => new FormControl<number>(params.cacheThreshold))
            ),
            cacheMaxAge: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                },
                parameters.map((params) => new FormControl<number>(params.cacheMaxAge))
            ),
            clientClass: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                },
                parameters.map((params) => new FormControl<string>(params.clientClass))
            ),
            requireClientClasses: new SharedParameterFormGroup<string[]>(
                {
                    type: 'client-classes',
                },
                parameters.map((params) => new FormControl<string[]>(params.requireClientClasses))
            ),
            ddnsGeneratedPrefix: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                    invalidText: 'Please specify a valid prefix.',
                },
                parameters.map((params) => new FormControl<string>(params.ddnsGeneratedPrefix, StorkValidators.fqdn))
            ),
            ddnsOverrideClientUpdate: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.ddnsOverrideClientUpdate))
            ),
            ddnsOverrideNoUpdate: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.ddnsOverrideNoUpdate))
            ),
            ddnsQualifyingSuffix: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                    invalidText: 'Please specify a valid suffix.',
                },
                parameters.map((params) => new FormControl<string>(params.ddnsQualifyingSuffix, StorkValidators.fqdn))
            ),
            ddnsReplaceClientName: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                    values: ['never', 'always', 'when-not-present'],
                },
                parameters.map((params) => new FormControl<string>(params.ddnsReplaceClientName))
            ),
            ddnsSendUpdates: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.ddnsSendUpdates))
            ),
            ddnsUpdateOnRenew: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.ddnsUpdateOnRenew))
            ),
            ddnsUseConflictResolution: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.ddnsUseConflictResolution))
            ),
            hostnameCharReplacement: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                },
                parameters.map((params) => new FormControl<string>(params.hostnameCharReplacement))
            ),
            hostnameCharSet: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                },
                parameters.map((params) => new FormControl<string>(params.hostnameCharSet))
            ),
            reservationsGlobal: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.reservationsGlobal))
            ),
            reservationsInSubnet: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.reservationsInSubnet))
            ),
            reservationsOutOfPool: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.reservationsOutOfPool))
            ),
            renewTimer: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                },
                parameters.map((params) => new FormControl<number>(params.renewTimer))
            ),
            rebindTimer: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                },
                parameters.map((params) => new FormControl<number>(params.rebindTimer))
            ),
            t1Percent: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                    min: 0,
                    max: 1,
                    fractionDigits: 2,
                },
                parameters.map((params) => new FormControl<number>(params.t1Percent))
            ),
            t2Percent: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                    min: 0,
                    max: 1,
                    fractionDigits: 2,
                },
                parameters.map((params) => new FormControl<number>(params.t2Percent))
            ),
            calculateTeeTimes: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.calculateTeeTimes))
            ),
            validLifetime: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                },
                parameters.map((params) => new FormControl<number>(params.validLifetime))
            ),
            minValidLifetime: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                },
                parameters.map((params) => new FormControl<number>(params.minValidLifetime))
            ),
            maxValidLifetime: new SharedParameterFormGroup<number>(
                {
                    type: 'number',
                },
                parameters.map((params) => new FormControl<number>(params.maxValidLifetime))
            ),
            allocator: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                    values: ['iterative', 'random', 'flq'],
                },
                parameters.map((params) => new FormControl<string>(params.allocator))
            ),
            authoritative: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.authoritative))
            ),
            interface: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                },
                parameters.map((params) => new FormControl<string>(params._interface))
            ),
            interfaceID: new SharedParameterFormGroup<string>(
                {
                    type: 'string',
                },
                parameters.map((params) => new FormControl<string>(params.interfaceID))
            ),
            storeExtendedInfo: new SharedParameterFormGroup<boolean>(
                {
                    type: 'boolean',
                },
                parameters.map((params) => new FormControl<boolean>(params.storeExtendedInfo))
            ),
        }
        // DHCPv4 parameters.
        switch (ipType) {
            case IPType.IPv4:
                form.fourOverSixInterface = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                    },
                    parameters.map((params) => new FormControl<string>(params.fourOverSixInterface))
                )
                form.fourOverSixInterfaceID = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                    },
                    parameters.map((params) => new FormControl<string>(params.fourOverSixInterfaceID))
                )
                form.fourOverSixSubnet = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                    },
                    parameters.map(
                        (params) => new FormControl<string>(params.fourOverSixSubnet, StorkValidators.ipv6Prefix())
                    )
                )
                form.bootFileName = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                    },
                    parameters.map((params) => new FormControl<string>(params.bootFileName))
                )
                form.matchClientID = new SharedParameterFormGroup<boolean>(
                    {
                        type: 'boolean',
                    },
                    parameters.map((params) => new FormControl<boolean>(params.matchClientID))
                )
                form.nextServer = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                        invalidText: 'Please specify an IPv4 address.',
                    },
                    parameters.map((params) => new FormControl<string>(params.nextServer, StorkValidators.ipv4()))
                )
                form.serverHostname = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                        invalidText: 'Please specify a valid hostname.',
                    },
                    parameters.map((params) => new FormControl<string>(params.serverHostname, StorkValidators.fqdn))
                )
                break

            // DHCPv6 parameters.
            default:
                form.preferredLifetime = new SharedParameterFormGroup<number>(
                    {
                        type: 'number',
                    },
                    parameters.map((params) => new FormControl<number>(params.preferredLifetime))
                )
                form.minPreferredLifetime = new SharedParameterFormGroup<number>(
                    {
                        type: 'number',
                    },
                    parameters.map((params) => new FormControl<number>(params.minPreferredLifetime))
                )
                form.maxPreferredLifetime = new SharedParameterFormGroup<number>(
                    {
                        type: 'number',
                    },
                    parameters.map((params) => new FormControl<number>(params.maxPreferredLifetime))
                )
                form.pdAllocator = new SharedParameterFormGroup<string>(
                    {
                        type: 'string',
                        values: ['iterative', 'random', 'flq'],
                    },
                    parameters.map((params) => new FormControl<string>(params.pdAllocator))
                )
                form.rapidCommit = new SharedParameterFormGroup<boolean>(
                    {
                        type: 'boolean',
                    },
                    parameters.map((params) => new FormControl<boolean>(params.rapidCommit))
                )
        }
        let formGroup = new FormGroup<KeaSubnetParametersForm>(form)
        return formGroup
    }

    /**
     * Converts a form holding DHCP parameters to a set of parameters assignable
     * to a subnet instance.
     *
     * @param form a form holding DHCP parameters for a subnet.
     * @returns An array of parameter sets for different servers.
     */
    convertFormToKeaSubnetParameters(form: FormGroup<KeaSubnetParametersForm>): KeaConfigSubnetDerivedParameters[] {
        return this.convertFormToKeaParameters(form)
    }

    /**
     * Creates a default parameters form for an empty subnet.
     *
     * @param ipType subnet universe (IPv4 or IPv6).
     * @returns A default form group for a subnet.
     */
    createDefaultKeaSubnetParametersForm(ipType: IPType): UntypedFormGroup {
        let parameters: KeaConfigSubnetDerivedParameters[] = [{}]
        return this.convertKeaSubnetParametersToForm(ipType, parameters)
    }

    /**
     * Converts a set of address pools in a subnet to a form.
     *
     * @param subnet a subnet instance holding the converted pools.
     * @returns An array of form groups representing address pools.
     */
    convertAddressPoolsToForm(subnet: Subnet): FormArray<FormGroup<AddressPoolForm>> {
        const formArray = new FormArray<FormGroup<AddressPoolForm>>([], StorkValidators.ipRangeOverlaps)
        // A subnet can be associated with many servers. Each server may contain
        // the same or different address pools. Some of the pools may overlap.
        // This call extracts the pools and combines those that are the same for
        // different servers. It makes it easier to later convert the extracted pools
        // to a form.
        const subnetWithUniquePools = extractUniqueSubnetPools(subnet)
        if (subnetWithUniquePools.length === 0) {
            return formArray
        }
        // Iterate over the extracted pools and convert them to a form.
        for (const pool of subnetWithUniquePools[0]?.pools) {
            // Attempt to validate and convert the pool range specified
            // as a string to an address range. It may throw.
            const addressRange = AddressRange.fromStringRange(pool.pool)
            formArray.push(
                new FormGroup<AddressPoolForm>({
                    range: new FormGroup<AddressRangeForm>(
                        {
                            start: new FormControl(addressRange.getFirst(), StorkValidators.ipInSubnet(subnet.subnet)),
                            end: new FormControl(addressRange.getLast(), StorkValidators.ipInSubnet(subnet.subnet)),
                        },
                        StorkValidators.ipRangeBounds
                    ),
                    // Local pools contain Kea-specific pool parameters for different servers.
                    // Extract them from the local pools and pass as an array to the conversion
                    // function.
                    parameters: this.convertKeaPoolParametersToForm(
                        pool.localPools?.map((lp) => lp.keaConfigPoolParameters) || []
                    ),
                    // Convert the options to a form.
                    options: new FormGroup({
                        unlocked: new FormControl(hasDifferentLocalPoolOptions(pool)),
                        data: new UntypedFormArray(
                            pool.localPools?.map((lp) =>
                                this.optionService.convertOptionsToForm(
                                    subnet.subnet?.includes('.') ? IPType.IPv4 : IPType.IPv6,
                                    lp.keaConfigPoolParameters?.options
                                )
                            ) || []
                        ),
                    }),
                    selectedDaemons: new FormControl<number[]>(
                        pool.localPools?.map((lp) => lp.daemonId) || [],
                        Validators.required
                    ),
                })
            )
        }
        return formArray
    }

    /**
     * Converts a form holding pool data to a pool instance.
     *
     * @param localData an interface pointing to a local subnet, pool or shared
     * network for which the data should be converted.
     * @param form form a form comprising pool data.
     * @returns A pool instance converted from the form.
     */
    convertFormToAddressPools(localData: LocalDaemonData, form: FormArray<FormGroup<AddressPoolForm>>): Pool[] {
        const pools: Pool[] = []
        for (let poolCtrl of form.controls) {
            const selectedDaemons = poolCtrl.get('selectedDaemons')?.value
            const index = this.getDaemonIndex(localData, selectedDaemons)
            if (index < 0) {
                continue
            }
            const range = `${poolCtrl.get('range.start').value}-${poolCtrl.get('range.end').value}`
            const params = this.convertFormToKeaParameters(poolCtrl.get('parameters') as FormGroup<AddressPoolForm>)
            const options = poolCtrl.get('options') as UntypedFormGroup
            const pool: Pool = {
                pool: range,
                keaConfigPoolParameters: params.length > index ? params[index] : null,
            }
            const data = options.get('data') as UntypedFormArray
            if (data?.length > index) {
                if (!pool.keaConfigPoolParameters) {
                    pool.keaConfigPoolParameters = {}
                }
                pool.keaConfigPoolParameters.options = this.optionService.convertFormToOptions(
                    range.includes(':') ? IPType.IPv6 : IPType.IPv4,
                    data.at(!!options.get('unlocked')?.value ? index : 0) as UntypedFormArray
                )
            }
            pools.push(pool)
        }
        return pools
    }

    /**
     * Converts subnet data to a form.
     *
     * @param ipType universe (i.e., IPv4 or IPv6 subnet)
     * @param subnet subnet data.
     * @returns A form created for a subnet.
     */
    convertSubnetToForm(ipType: IPType, subnet: Subnet): FormGroup<SubnetForm> {
        let formGroup = new FormGroup<SubnetForm>({
            subnet: new FormControl({ value: subnet.subnet, disabled: true }),
            pools: this.convertAddressPoolsToForm(subnet),
            parameters: this.convertKeaSubnetParametersToForm(
                ipType,
                subnet.localSubnets?.map((ls) => ls.keaConfigSubnetParameters.subnetLevelParameters) || []
            ),
            options: new FormGroup({
                unlocked: new FormControl(hasDifferentSubnetLevelOptions(subnet)),
                data: new UntypedFormArray(
                    subnet.localSubnets?.map((ls) =>
                        this.optionService.convertOptionsToForm(
                            ipType,
                            ls.keaConfigSubnetParameters.subnetLevelParameters.options
                        )
                    ) || []
                ),
            }),
            selectedDaemons: new FormControl<number[]>(
                subnet.localSubnets?.map((ls) => ls.daemonId) || [],
                Validators.required
            ),
        })
        return formGroup
    }

    /**
     * Converts a form holding subnet data to a subnet instance.
     *
     * It currently only converts the simple DHCP parameters and options. It
     * excludes complex parameters, such as relay specification or pools.
     *
     * @param form a form comprising subnet data.
     * @returns A subnet instance converted from the form.
     */
    convertFormToSubnet(form: FormGroup<SubnetForm>): Subnet {
        let subnet: Subnet = {
            subnet: form.get('subnet')?.value,
            localSubnets:
                form.get('selectedDaemons')?.value.map((sd) => {
                    let ls: LocalSubnet = {
                        daemonId: sd,
                    }
                    return ls
                }) || [],
        }
        // Convert the simple DHCP parameters and options.
        const params = this.convertFormToKeaSubnetParameters(
            form.get('parameters') as FormGroup<KeaSubnetParametersForm>
        )
        const options = form.get('options') as UntypedFormGroup
        for (let i = 0; i < subnet.localSubnets.length; i++) {
            subnet.localSubnets[i].keaConfigSubnetParameters = {
                subnetLevelParameters: {},
            }
            if (params?.length > i) {
                subnet.localSubnets[i].keaConfigSubnetParameters = {
                    subnetLevelParameters: params[i],
                }
            }
            subnet.localSubnets[i].pools = this.convertFormToAddressPools(
                subnet.localSubnets[i],
                form.get('pools') as FormArray<FormGroup<AddressPoolForm>>
            )
            const data = options.get('data') as UntypedFormArray
            if (data?.length > i) {
                subnet.localSubnets[i].keaConfigSubnetParameters.subnetLevelParameters.options =
                    this.optionService.convertFormToOptions(
                        subnet.subnet?.includes(':') ? IPType.IPv6 : IPType.IPv4,
                        data.at(!!options.get('unlocked')?.value ? i : 0) as UntypedFormArray
                    )
            }
        }
        return subnet
    }

    /**
     * Adjusts the form to the new daemons selection.
     *
     * This function is invoked when a user selected or unselected daemons
     * associated with a subnet or a pool. New form controls are added when
     * new daemons are selected. Existing form controls are removed when the
     * daemons are unselected.
     *
     * @param formGroup form group holding the subnet or pool data.
     * @param toggledDaemonIndex index of the selected or unselected daemon.
     * @param prevSelectedDaemonsNum a number of previously selected daemons.
     */
    adjustFormForSelectedDaemons(
        formGroup: FormGroup<SubnetForm | AddressPoolForm>,
        toggledDaemonIndex: number,
        prevSelectedDaemonsNum: number
    ): void {
        // If the number of daemons hasn't changed, there is nothing more to do.
        const selectedDaemons = formGroup.get('selectedDaemons').value ?? []
        if (prevSelectedDaemonsNum === selectedDaemons.length) {
            return
        }

        const pools = formGroup.get('pools') as FormArray<FormGroup<AddressPoolForm>>
        if (pools) {
            for (const pool of pools.controls) {
                pool.get('selectedDaemons').setValue(
                    pool.get('selectedDaemons').value.filter((sd) => selectedDaemons.find((found) => found === sd))
                )
            }
        }

        // Get form controls pertaining to the servers before the selection change.
        const parameters = formGroup.get('parameters') as FormGroup<KeaSubnetParametersForm | KeaPoolParametersForm>

        // Iterate over the controls holding the configuration parameters.
        for (const key of Object.keys(parameters?.controls)) {
            const values = parameters.get(key).get('values') as UntypedFormArray
            const unlocked = parameters.get(key).get('unlocked') as UntypedFormControl
            if (selectedDaemons.length < prevSelectedDaemonsNum) {
                // We have removed a daemon from a list. Let's remove the
                // controls pertaining to the removed daemon.
                if (values?.length > selectedDaemons.length) {
                    // If we have the index of the removed daemon let's remove the
                    // controls appropriate for this daemon. This will preserve the
                    // values specified for any other daemons. Otherwise, let's remove
                    // the last control.
                    if (toggledDaemonIndex >= 0 && toggledDaemonIndex < values.controls.length && unlocked?.value) {
                        values.controls.splice(toggledDaemonIndex, 1)
                    } else {
                        values.controls.splice(selectedDaemons.length)
                    }
                }
                // Clear the unlock flag when there is only one server left.
                if (values?.length < 2) {
                    unlocked?.setValue(false)
                    unlocked?.disable()
                }
            } else {
                // If we have added a new server we should populate some values
                // for this server. Let's use the values associated with the first
                // server. We should have at least one server at this point but
                // let's double check.
                if (values?.length > 0) {
                    values.push(this.genericFormService.cloneControl(values.at(0)))
                    unlocked?.enable()
                }
            }
        }

        // Handle the daemons selection change for the DHCP options.
        const data = formGroup.get('options.data') as UntypedFormArray
        if (data?.controls?.length > 0) {
            const unlocked = formGroup.get('options')?.get('unlocked') as UntypedFormControl
            if (selectedDaemons.length < prevSelectedDaemonsNum) {
                // If we have the index of the removed daemon let's remove the
                // controls appropriate for this daemon. This will preserve the
                // values specified for any other daemons. Otherwise, let's remove
                // the last control.
                if (toggledDaemonIndex >= 0 && toggledDaemonIndex < data.controls.length && unlocked.value) {
                    data.controls.splice(toggledDaemonIndex, 1)
                } else {
                    data.controls.splice(selectedDaemons.length)
                }
                // Clear the unlock flag when there is only one server left.
                if (data.controls.length < 2) {
                    unlocked?.setValue(false)
                    unlocked?.disable()
                }
            } else {
                data.push(this.optionService.cloneControl(data.controls[0]))
                unlocked?.enable()
            }
        }
    }
}
