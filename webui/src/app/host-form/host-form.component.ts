import { Component, OnInit, Input, Output, EventEmitter, OnDestroy } from '@angular/core'
import {
    AbstractControl,
    FormBuilder,
    FormArray,
    FormGroup,
    ValidatorFn,
    Validators,
    ValidationErrors,
} from '@angular/forms'
import { MessageService, SelectItem } from 'primeng/api'
import { map } from 'rxjs/operators'
import { collapseIPv6Number, isIPv4, IPv4, IPv4CidrRange, IPv6, IPv6CidrRange, Validator } from 'ip-num'
import { StorkValidators } from '../validators'
import { DHCPService } from '../backend/api/api'
import { CreateHostBeginResponse } from '../backend/model/createHostBeginResponse'
import { Host } from '../backend/model/host'
import { IPReservation } from '../backend/model/iPReservation'
import { LocalHost } from '../backend/model/localHost'
import { UpdateHostBeginResponse } from '../backend/model/updateHostBeginResponse'
import { Subnet } from '../backend/model/subnet'
import { HostForm } from '../forms/host-form'
import { createDefaultDhcpOptionFormGroup } from '../forms/dhcp-option-form'
import { DhcpOptionSetForm } from '../forms/dhcp-option-set-form'
import { IPType } from '../iptype'
import { stringToHex } from '../utils'

/**
 * A form validator checking if a subnet has been selected for
 * non-global reservation.
 *
 * @param group top-level component form group.
 * @returns validation errors when no subnet has been selected for
 *          a non-global reservation.
 */
function subnetRequiredValidator(group: FormGroup): ValidationErrors | null {
    if (!group.get('globalReservation').value && !group.get('selectedSubnet').value) {
        // It is not a global reservation and no subnet has been selected.
        const errs = {
            err: 'subnet is required for non-global reservations',
        }
        // Highlight the dropdown.
        if (group.get('selectedSubnet').touched && group.get('selectedSubnet').dirty) {
            group.get('selectedSubnet').setErrors(errs)
        }
        return errs
    }
    // Clear errors because everything seems fine.
    group.get('selectedSubnet').setErrors(null)
    return null
}

/**
 * A form validator checking if a selected DHCP identifier has been specified
 * and does not exceed the maximum length.
 *
 * @param group a selected form group belonging to the ipGroups array.
 * @returns validation errors when no value has been specified in the
 *          idInputHex input box (when selected type is hex) or idInputText
 *          (when selected type is text). It also returns validation errors
 *          when hw-address exceeds 40 hexadecimal digits or 20 characters
 *          or when other identifiers exceed 256 hexadecimal digits or 128
 *          characters.
 */
function identifierValidator(group: FormGroup): ValidationErrors | null {
    const idType = group.get('idType')
    const idInputHex = group.get('idInputHex')
    const idInputText = group.get('idInputText')
    let valErrors: ValidationErrors = null
    switch (group.get('idFormat').value) {
        case 'hex':
            // User selected hex format. Clear validation errors pertaining
            // to the idInputText and set errors for idInputHex if the
            // required value is not specified.
            idInputText.setErrors(null)
            valErrors =
                Validators.required(idInputHex) ||
                StorkValidators.hexIdentifierLength(idType.value === 'hw-address' ? 40 : 256)(idInputHex)
            if (idInputHex.valid) {
                idInputHex.setErrors(valErrors)
            }
            return valErrors
        case 'text':
            // User selected text format.
            idInputHex.setErrors(null)
            valErrors =
                Validators.required(idInputText) ||
                Validators.maxLength(idType.value === 'hw-address' ? 20 : 128)(idInputText)
            if (idInputText.valid) {
                idInputText.setErrors(valErrors)
            }
            return valErrors
    }
    return null
}

/**
 * A form validator checking if the specified IP address is within a
 * selected subnet range.
 *
 * It skips the validation if the IP address is not specified, if the
 * specified address is invalid, subnet hasn't been selected or the
 * reservation is global.
 *
 * @param ipType specified if an IPv4 or IPv6 address is validated.
 * @param hostForm a host form state.
 * @returns validator function that returns validation errors when a
 *          subnet is selected and the specified IPv4 or IPv6 address
 *          is not in this subnet range.
 */
function addressInSubnetValidator(ipType: IPType, hostForm: HostForm): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        // The value must be specified, must be a correct IP address, the
        // reservation must not be global and the subnet must be specified.
        if (
            control.value === null ||
            typeof control.value !== 'string' ||
            control.value.length === 0 ||
            !hostForm ||
            (hostForm.group && hostForm.group.get('globalReservation').value) ||
            !hostForm.filteredSubnets ||
            (ipType === IPType.IPv4 && !Validator.isValidIPv4String(control.value)[0]) ||
            (ipType === IPType.IPv6 && !Validator.isValidIPv6String(control.value)[0])
        ) {
            return null
        }
        // Convert the address to an IPv4 or IPv6 object.
        let ipAddress: IPv4 | IPv6
        ipAddress = ipType === IPType.IPv4 ? IPv4.fromString(control.value) : IPv6.fromString(control.value)
        if (!ipAddress) {
            return null
        }
        // Find the selected subnet range.
        const subnetRange = hostForm.getSelectedSubnetRange()
        if (!subnetRange) {
            return null
        }
        // Make sure the address is within the subnet boundaries.
        if (ipAddress.isLessThan(subnetRange[1].getFirst()) || ipAddress.isGreaterThan(subnetRange[1].getLast())) {
            return { 'ip-subnet-range': `IP address is not in the subnet ${subnetRange[0]} range.` }
        }
        return null
    }
}

interface MappedDaemon {
    id: number
    name: string
    label: string
}

interface MappedHostBeginData {
    id: number
    subnets: Array<Subnet>
    daemons: Array<MappedDaemon>
    host?: Host
}

/**
 * A component providing a form for editing and adding new host
 * reservation.
 */
@Component({
    selector: 'app-host-form',
    templateUrl: './host-form.component.html',
    styleUrls: ['./host-form.component.sass'],
})
export class HostFormComponent implements OnInit, OnDestroy {
    /**
     * Form state instance.
     *
     * The instance is shared between the parent and this component.
     * Holding the instance in the parent component allows for restoring
     * the form (after edits) after the component has been (temporarily)
     * destroyed.
     */
    @Input() form: HostForm = null

    /**
     * Host identifier.
     *
     * It should be set in cases when the form is used to update an existing
     * host reservation. It is not set when the form is used to create new
     * host reservation
     */
    @Input() hostId: number = 0

    /**
     * An event emitter notifying that the component is destroyed.
     *
     * A parent component receiving this event can remember the current
     * form state.
     */
    @Output() formDestroy = new EventEmitter<HostForm>()

    /**
     * An event emitter notifying that the form has been submitted.
     */
    @Output() formSubmit = new EventEmitter<HostForm>()

    /**
     * Different IP reservation types listed in the drop down.
     */
    ipTypes: SelectItem[] = []

    /**
     * Different host identifier types listed in the drop down.
     */
    hostIdTypes: SelectItem[] = []

    /**
     * Different identifier input formats listed in the drop down.
     */
    hostIdFormats = [
        {
            label: 'hex',
            value: 'hex',
        },
        {
            label: 'text',
            value: 'text',
        },
    ]

    /**
     * Default placeholder displayed in the IPv4 resevation input box.
     */
    static defaultIPv4Placeholder = '?.?.?.?'

    /**
     * Default placeholder displayed in the IPv6 resevation input box.
     */
    static defaultIPv6Placeholder = 'e.g. 2001:db8:1::'

    /**
     * Current placeholder displayed in the IPv4 resevation input box.
     */
    ipv4Placeholder = HostFormComponent.defaultIPv4Placeholder

    /**
     * Current placeholder displayed in the IPv6 resevation input box.
     */
    ipv6Placeholder = HostFormComponent.defaultIPv6Placeholder

    /**
     * Constructor.
     *
     * @param _formBuilder private form builder instance.
     * @param _dhcpApi REST API server service.
     * @param _messageService service displaying error and success messages.
     */
    constructor(
        private _formBuilder: FormBuilder,
        private _dhcpApi: DHCPService,
        private _messageService: MessageService
    ) {}

    /**
     * Component lifecycle hook invoked during initialization.
     *
     * If the provided form instance has been preserved in the parent
     * component this instance is used and the initialization skipped.
     * Otherwise, the form is initialized to defaults.
     */
    ngOnInit(): void {
        // Initialize the form instance if the parent hasn't supplied one.
        if (!this.form) {
            this.form = new HostForm()
        }
        // Initialize the options in the drop down lists.
        this._updateHostIdTypes()
        this._updateIPTypes()

        // Check if the form has been already edited and preserved in the
        // parent component. If so, use it. The user will continue making
        // edits.
        if (this.form.preserved) {
            return
        }

        // New form.
        this.formGroup = this._formBuilder.group(
            {
                globalReservation: [false],
                selectedDaemons: ['', Validators.required],
                selectedSubnet: [null],
                hostIdGroup: this._formBuilder.group(
                    {
                        idType: [this.hostIdTypes[0].label],
                        idInputHex: ['', StorkValidators.hexIdentifier()],
                        idInputText: [''],
                        idFormat: ['hex'],
                    },
                    {
                        validators: [identifierValidator],
                    }
                ),
                ipGroups: this._formBuilder.array([this._createNewIPGroup()]),
                hostname: ['', StorkValidators.fqdn],
                options: this._formBuilder.array([]),
            },
            {
                validators: [subnetRequiredValidator],
            }
        )

        // Begin transaction.
        if (this.hostId) {
            // Send POST to /hosts/{id}/transaction/new.
            this._updateHostBegin()
        } else {
            // Send POST to /hosts/new/transaction/new.
            this._createHostBegin()
        }
    }

    /**
     * Sends a request to the server to begin a new transaction for adding
     * new host reservation.
     *
     * If the call is successful, the form components initialized with the
     * returned data, e.g. a list of available servers, subnets etc.
     * If an error occurs, the error text is remembered and displayed along
     * with the retry button.
     */
    private _createHostBegin(): void {
        this._dhcpApi
            .createHostBegin()
            .pipe(
                map((data) => {
                    // We have to mangle the returned information and store them
                    // in the format usable by the component.
                    return this._mapHostBeginData(data)
                })
            )
            .toPromise()
            .then((data) => {
                this._initializeForm(data)
            })
            .catch((err) => {
                let msg = err.statusText
                if (err.error && err.error.message) {
                    msg = err.error.message
                }
                if (!msg) {
                    msg = `status: ${err.status}`
                }
                this._messageService.add({
                    severity: 'error',
                    summary: 'Cannot create new transaction',
                    detail: 'Failed to create transaction for adding new host: ' + msg,
                    life: 10000,
                })
                this.form.initError = msg
            })
    }

    private _updateHostBegin(): void {
        this._dhcpApi
            .updateHostBegin(this.hostId)
            .pipe(
                map((data) => {
                    // We have to mangle the returned information and store them
                    // in the format usable by the component.
                    return this._mapHostBeginData(data)
                })
            )
            .toPromise()
            .then((data) => {
                this._initializeForm(data)
            })
            .catch((err) => {
                let msg = err.statusText
                if (err.error && err.error.message) {
                    msg = err.error.message
                }
                if (!msg) {
                    msg = `status: ${err.status}`
                }
                this._messageService.add({
                    severity: 'error',
                    summary: 'Cannot create new transaction',
                    detail: `Failed to create transaction for updating host ${this.hostId}: ` + msg,
                    life: 10000,
                })
                this.form.initError = msg
            })
    }

    private _mapHostBeginData(data: CreateHostBeginResponse | UpdateHostBeginResponse): MappedHostBeginData {
        let daemons = []
        for (const d of data.daemons) {
            let daemon = {
                id: d.id,
                name: d.name,
                label: `${d.app.name}/${d.name}`,
            }
            daemons.push(daemon)
        }
        let mappedData: MappedHostBeginData = {
            id: data.id,
            subnets: data.subnets,
            daemons: daemons,
        }
        if ('host' in data) {
            mappedData.host = data.host
        }
        return mappedData
    }

    private _initializeForm(data: CreateHostBeginResponse | UpdateHostBeginResponse): void {
        // Success. Clear any existing errors.
        this.form.initError = null
        // The server should return new transaction id and a current list of
        // daemons and subnets to select.
        this.form.transactionId = data.id
        this.form.allDaemons = data.daemons
        this.form.allSubnets = data.subnets
        // Initially, list all daemons.
        this.form.filteredDaemons = this.form.allDaemons
        // Initially, show all subnets.
        this.form.filteredSubnets = this.form.allSubnets
    }

    /**
     * Component lifecycle hook invoked when the component is destroyed.
     *
     * It emits an event to the parent to cause the parent to preserve
     * the form instance. This instance can be later used to continue making
     * the edits when the component is re-created. It also sets the
     * preserved flag to indicate that the form was recovered, and thus
     * skip initialization in the next ngOnInit function invocation.
     */
    ngOnDestroy(): void {
        this.form.preserved = true
        this.formDestroy.emit(this.form)
    }

    /**
     * Returns main form group for the component.
     *
     * @returns form group.
     */
    get formGroup(): FormGroup {
        return this.form.group
    }

    /**
     * Sets main form group for the component.
     *
     * @param fg new form group.
     */
    set formGroup(fg: FormGroup) {
        this.form.group = fg
    }

    /**
     * Updates presented list of selectable host ID types.
     *
     * The list depends on whether we have selected a DHCPv6 server,
     * DHCPv4 server or no servers.
     */
    private _updateHostIdTypes(): void {
        if (this.form.dhcpv6) {
            // DHCPv6 server supports fewer identifier types.
            this.hostIdTypes = [
                {
                    label: 'hw-address',
                    value: 'hw-address',
                },
                {
                    label: 'duid',
                    value: 'duid',
                },
                {
                    label: 'flex-id',
                    value: 'flex-id',
                },
            ]
            return
        }
        this.hostIdTypes = [
            {
                label: 'hw-address',
                value: 'hw-address',
            },
            {
                label: 'client-id',
                value: 'client-id',
            },
            {
                label: 'circuit-id',
                value: 'circuit-id',
            },
            {
                label: 'duid',
                value: 'duid',
            },
            {
                label: 'flex-id',
                value: 'flex-id',
            },
        ]
    }

    /**
     * Adds new IP address or delegated prefix input box to the form.
     *
     * By default, the input box is for an IPv4 reservation. However, if
     * there is another box already (only possible in the IPv6 case), the
     * new box uses the type of the last box.
     */
    addIPInput(): void {
        let ipType = this.form.dhcpv6 ? 'ia_na' : 'ipv4'
        // Check if some IP input boxes have been already added.
        if (this.ipGroups.length > 0) {
            // Some input boxes already exist. Use the last one's type
            // as a default.
            ipType = this.ipGroups.at(this.ipGroups.length - 1).get('ipType').value
        }
        this.ipGroups.push(this._createNewIPGroup(ipType))
    }

    /**
     * Deletes specified IP address or delegated prefix input box from
     * the form.
     *
     * @param index input box index beginning from 0.
     */
    deleteIPInput(index): void {
        ;(this.formGroup.get('ipGroups') as FormArray).removeAt(index)
    }

    /**
     * Updates presented list of selectable IP reservation types.
     *
     * The list depends on whether we have selected a DHCPv6 server,
     * DHCPv4 server or no servers.
     */
    private _updateIPTypes(): void {
        if (this.form.dhcpv6) {
            this.ipTypes = [
                {
                    label: 'IPv6 address',
                    value: 'ia_na',
                },
                {
                    label: 'IPv6 prefix',
                    value: 'ia_pd',
                },
            ]
            return
        }
        this.ipTypes = [
            {
                label: 'IPv4 address',
                value: 'ipv4',
            },
        ]
    }

    /**
     * Convenience function returning the form array with IP reservations.
     *
     * @returns form array with IP reservations.
     */
    get ipGroups(): FormArray {
        return this.formGroup.get('ipGroups') as FormArray
    }

    /**
     * Creates new form group for specifying new IP reservation.
     *
     * @param defaultType IP reservation type.
     * @returns form group for specifying new IP reservation.
     */
    private _createNewIPGroup(defaultType = 'ipv4'): FormGroup {
        return this._formBuilder.group({
            ipType: [defaultType],
            inputIPv4: [
                '',
                Validators.compose([StorkValidators.ipv4(), addressInSubnetValidator(IPType.IPv4, this.form)]),
            ],
            inputNA: [
                '',
                Validators.compose([StorkValidators.ipv6(), addressInSubnetValidator(IPType.IPv6, this.form)]),
            ],
            inputPD: ['', StorkValidators.ipv6()],
            inputPDLength: ['64', Validators.required],
        })
    }

    /**
     * Clears specified IP reservations.
     *
     * It is used in cases when user switches between different server types,
     * e.g. previously selected a DHCPv4 server and now switched to DHCPv6
     * server. In that case, the specified information is no longer valid.
     */
    private _resetIPGroups(): void {
        // Nothing to do if there are no IP reservations specified.
        if (this.ipGroups.length > 0) {
            this.ipGroups.clear()
            this.ipGroups.push(this._createNewIPGroup(this.form.dhcpv6 ? 'ia_na' : 'ipv4'))
        }
    }

    /**
     * Convenience function returning the form array with DHCP options.
     *
     * @returns form array with DHCP options.
     */
    get optionsArray(): FormArray {
        return this.formGroup.get('options') as FormArray
    }

    /**
     * A callback invoked when selected DHCP servers have changed.
     *
     * Servers selection affects available subnets. If no servers are selected,
     * all subnets are listed for selection. However, if one or more servers
     * are selected only those subnets served by all selected servers are
     * listed. In that case, each listed subnet must be served by all selected
     * servers. If selected servers have no common subnets, no subnets are
     * listed.
     */
    onDaemonsChange(): void {
        // Capture the servers selected by the user.
        const selectedDaemons = this.formGroup.get('selectedDaemons').value

        // It is important to determine what type of a server the user selected.
        // Check if any of the selected servers are DHCPv4.
        this.form.dhcpv4 = selectedDaemons.some((ss) => {
            return this.form.allDaemons.find((d) => d.id === ss && d.name === 'dhcp4')
        })
        if (!this.form.dhcpv4) {
            // If user selected no DHCPv4 server, perhaps selected a DHCPv6 server?
            this.form.dhcpv6 = selectedDaemons.some((ss) => {
                return this.form.allDaemons.find((d) => d.id === ss && d.name === 'dhcp6')
            })
        } else {
            // If user selected DHCPv4 server he didn't select a DHCPv6 server.
            this.form.dhcpv6 = false
        }

        // Filter selectable other selectable servers based on the current selection.
        if (this.form.dhcpv4) {
            this.form.filteredDaemons = this.form.allDaemons.filter((d) => d.name === 'dhcp4')
        } else if (this.form.dhcpv6) {
            this.form.filteredDaemons = this.form.allDaemons.filter((d) => d.name === 'dhcp6')
        } else {
            this.form.filteredDaemons = this.form.allDaemons
        }

        // Selectable host identifier types depend on the selected server types.
        this._updateHostIdTypes()

        if (
            this.ipGroups.length === 0 ||
            (this.form.dhcpv4 && this.ipGroups.getRawValue().some((g) => g.ipType !== 'ipv4')) ||
            (this.form.dhcpv6 && this.ipGroups.getRawValue().some((g) => g.ipType === 'ipv4'))
        ) {
            // The current IP reservation edits no longer match the selected server types.
            // Let's reset current IP reservations and let the user start over.
            this._resetIPGroups()
            this._updateIPTypes()
        }

        // We take short path when no servers are selected. Just make all
        // subnets available.
        if (selectedDaemons.length === 0) {
            this.form.filteredSubnets = this.form.allSubnets
            return
        }
        // Filter subnets.
        this.form.filteredSubnets = this.form.allSubnets.filter((s) => {
            // We will be filtering by daemonId, so we need to look into
            // the localSubnet.
            return s.localSubnets.some((ls) => {
                return (
                    // At least one daemonId in the subnet should belong to
                    // the array of our selected servers AND each selected
                    // server must be associated with our subnet.
                    selectedDaemons.includes(ls.daemonId) > 0 &&
                    selectedDaemons.every((ss) => s.localSubnets.find((ls2) => ls2.daemonId === ss))
                )
            })
        })
        // Changing the list of selectable subnets may affect previous
        // subnet selection. If previously selected subnet is still in
        // the filtered list we can keep this selection. Otherwise, we
        // have to reset the subnet selection.
        if (!this.form.filteredSubnets.find((fs) => fs.id === this.formGroup.get('selectedSubnet').value)) {
            this.formGroup.get('selectedSubnet').patchValue(null)
        }
    }

    /**
     * A callback called when a subnet has been selected or de-selected.
     *
     * It iterates over the specified IP addresses and checks if they belong
     * to the new subnet boundaries. It also updates the placeholders of the
     * respective input boxes. The placeholders contain IP addresses suitable
     * for the selected subnet.
     */
    onSelectedSubnetChange(): void {
        for (let i = 0; i < this.ipGroups.length; i++) {
            this.ipGroups.at(i).get('inputIPv4').updateValueAndValidity()
            this.ipGroups.at(i).get('inputNA').updateValueAndValidity()
        }
        const range = this.form.getSelectedSubnetRange()
        if (range) {
            let first = range[1].getFirst()
            if (isIPv4(first)) {
                this.ipv4Placeholder = `in range of ${first.toString()} - ${range[1].getLast()}`
            } else {
                this.ipv6Placeholder = collapseIPv6Number(first.toString())
            }
        } else {
            this.ipv4Placeholder = HostFormComponent.defaultIPv4Placeholder
            this.ipv6Placeholder = HostFormComponent.defaultIPv6Placeholder
        }
    }

    /**
     * A callback called when new host identifier type has been selected.
     *
     * It updates the validity of the input fields in which the identifier is
     * specified.
     */
    onSelectedIdentifierChange(): void {
        if (this.formGroup.get('hostIdGroup.idFormat').value === 'hex') {
            this.formGroup.get('hostIdGroup.idInputHex').updateValueAndValidity()
        } else {
            this.formGroup.get('hostIdGroup.idInputText').updateValueAndValidity()
        }
    }

    /**
     * A function called when a user clicked to add a new option form.
     *
     * It creates a new default form group for the option.
     */
    onOptionAdd(): void {
        this.optionsArray.push(createDefaultDhcpOptionFormGroup(this.form.dhcpv6 ? IPType.IPv6 : IPType.IPv4))
    }

    /**
     * A function called when a user attempts to submit the new host reservation.
     *
     * It collects the data from the form and sends the request to commit the
     * current transaction (hosts/new/transaction/{id}/submit).
     */
    onSubmit(): void {
        // Check if it is global reservation or subnet-level reservation.
        const selectedSubnet = this.formGroup.get('globalReservation').value
            ? 0
            : this.formGroup.get('selectedSubnet').value

        // DHCP options.
        let options = []
        if (this.optionsArray) {
            try {
                const optionsForm = new DhcpOptionSetForm(this.optionsArray)
                optionsForm.process(this.form.dhcpv4 ? IPType.IPv4 : IPType.IPv6)
                options = optionsForm.getSerializedOptions()
            } catch (err) {
                this._messageService.add({
                    severity: 'error',
                    summary: 'Cannot commit new host',
                    detail: 'Processing specified DHCP options failed: ' + err,
                    life: 10000,
                })
                return
            }
        }

        // Create associations with the daemons.
        let localHosts: LocalHost[] = []
        const selectedDaemons = this.formGroup.get('selectedDaemons').value
        for (let id of selectedDaemons) {
            localHosts.push({
                daemonId: id,
                dataSource: 'api',
                options: options,
            })
        }

        // Use hex value or convert text value to hex.
        const idHexValue =
            this.formGroup.get('hostIdGroup.idFormat').value === 'hex'
                ? this.formGroup.get('hostIdGroup.idInputHex').value.trim()
                : stringToHex(this.formGroup.get('hostIdGroup.idInputText').value.trim())

        let addressReservations: IPReservation[] = []
        let prefixReservations: IPReservation[] = []
        for (let i = 0; i < this.ipGroups.length; i++) {
            const group = this.ipGroups.at(i)
            switch (group.get('ipType').value) {
                case 'ipv4':
                    const inputIPv4 = group.get('inputIPv4').value.trim()
                    if (inputIPv4.length > 0) {
                        addressReservations.push({
                            address: `${inputIPv4}/32`,
                        })
                    }
                    break
                case 'ia_na':
                    const inputNA = group.get('inputNA').value.trim()
                    if (inputNA.length > 0) {
                        addressReservations.push({
                            address: `${inputNA}/128`,
                        })
                    }
                    break
                case 'ia_pd':
                    const inputPD = group.get('inputPD').value.trim()
                    if (inputPD.length > 0) {
                        prefixReservations.push({
                            address: `${inputPD}/${group.get('inputPDLength').value}`,
                        })
                    }
                    break
            }
        }

        // Create host.
        let host: Host = {
            subnetId: selectedSubnet,
            hostIdentifiers: [
                {
                    idType: this.formGroup.get('hostIdGroup.idType').value,
                    idHexValue: idHexValue,
                },
            ],
            addressReservations: addressReservations,
            prefixReservations: prefixReservations,
            hostname: this.formGroup.get('hostname').value.trim(),
            localHosts: localHosts,
        }

        // Submit the host.
        this._dhcpApi
            .createHostSubmit(this.form.transactionId, host)
            .toPromise()
            .then(() => {
                this._messageService.add({
                    severity: 'success',
                    summary: 'Host reservation successfully added',
                    detail: 'The new host reservation may appear in Stork with some delay.',
                })
                // Notify the parent component about successful submission.
                this.formSubmit.emit(this.form)
            })
            .catch((err) => {
                let msg = err.statusText
                if (err.error && err.error.message) {
                    msg = err.error.message
                }
                this._messageService.add({
                    severity: 'error',
                    summary: 'Cannot commit new host',
                    detail: 'The transaction adding new host failed: ' + msg,
                    life: 10000,
                })
            })
    }

    /**
     * A function called when user clicks the retry button after failure to begin
     * a new transaction.
     */
    onRetry(): void {
        if (this.hostId) {
            this._updateHostBegin()
        } else {
            this._createHostBegin()
        }
    }
}
