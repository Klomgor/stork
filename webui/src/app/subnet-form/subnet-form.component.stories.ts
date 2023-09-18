import { Story, Meta, moduleMetadata } from '@storybook/angular'
import { SubnetFormComponent } from './subnet-form.component'
import { toastDecorator } from '../utils.stories'
import { FieldsetModule } from 'primeng/fieldset'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { HttpClientModule } from '@angular/common/http'
import { MessageService } from 'primeng/api'
import { ToastModule } from 'primeng/toast'
import { SharedParametersFormComponent } from '../shared-parameters-form/shared-parameters-form.component'
import { ButtonModule } from 'primeng/button'
import { CheckboxModule } from 'primeng/checkbox'
import { ChipsModule } from 'primeng/chips'
import { DropdownModule } from 'primeng/dropdown'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { InputNumberModule } from 'primeng/inputnumber'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { TriStateCheckboxModule } from 'primeng/tristatecheckbox'
import { OverlayPanelModule } from 'primeng/overlaypanel'
import { UpdateSubnetBeginResponse } from '../backend'
import { DhcpClientClassSetFormComponent } from '../dhcp-client-class-set-form/dhcp-client-class-set-form.component'
import { DhcpOptionSetFormComponent } from '../dhcp-option-set-form/dhcp-option-set-form.component'
import { DhcpOptionFormComponent } from '../dhcp-option-form/dhcp-option-form.component'
import { SplitButtonModule } from 'primeng/splitbutton'
import { DividerModule } from 'primeng/divider'
import { EntityLinkComponent } from '../entity-link/entity-link.component'
import { RouterTestingModule } from '@angular/router/testing'
import { HelpTipComponent } from '../help-tip/help-tip.component'
import { MultiSelectModule } from 'primeng/multiselect'
import { ProgressSpinnerModule } from 'primeng/progressspinner'
import { MessagesModule } from 'primeng/messages'

let mockUpdateSubnet4BeginData: UpdateSubnetBeginResponse = {
    id: 123,
    subnet: {
        id: 123,
        subnet: '192.0.2.0/24',
        localSubnets: [
            {
                id: 123,
                appId: 234,
                daemonId: 1,
                appName: 'server 1',
                machineAddress: '10.1.1.1.',
                machineHostname: 'myhost.example.org',
                pools: [
                    {
                        pool: '192.0.2.10-192.0.2.100',
                        keaConfigPoolParameters: {
                            clientClass: 'foo',
                            requireClientClasses: ['foo', 'bar'],
                            options: [],
                            optionsHash: '',
                        },
                    },
                ],
                keaConfigSubnetParameters: {
                    subnetLevelParameters: {
                        allocator: 'random',
                        options: [
                            {
                                alwaysSend: true,
                                code: 5,
                                encapsulate: '',
                                fields: [
                                    {
                                        fieldType: 'ipv4-address',
                                        values: ['192.0.2.1'],
                                    },
                                ],
                                options: [],
                                universe: 4,
                            },
                        ],
                        optionsHash: '123',
                    },
                },
            },
            {
                id: 123,
                appId: 234,
                daemonId: 2,
                appName: 'server 2',
                machineAddress: '10.1.1.1.',
                machineHostname: 'myhost.example.org',
                pools: [
                    {
                        pool: '192.0.2.10-192.0.2.100',
                        keaConfigPoolParameters: {
                            clientClass: 'foo',
                            requireClientClasses: ['foo', 'bar'],
                            options: [],
                            optionsHash: '',
                        },
                    },
                ],
                keaConfigSubnetParameters: {
                    subnetLevelParameters: {
                        allocator: 'iterative',
                        options: [
                            {
                                alwaysSend: true,
                                code: 5,
                                encapsulate: '',
                                fields: [
                                    {
                                        fieldType: 'ipv4-address',
                                        values: ['192.0.2.2'],
                                    },
                                ],
                                options: [],
                                universe: 4,
                            },
                        ],
                        optionsHash: '234',
                    },
                },
            },
        ],
    },
    daemons: [
        {
            id: 1,
            name: 'dhcp4',
            app: {
                name: 'first',
            },
        },
        {
            id: 3,
            name: 'dhcp6',
            app: {
                name: 'first',
            },
        },
        {
            id: 2,
            name: 'dhcp4',
            app: {
                name: 'second',
            },
        },
        {
            id: 4,
            name: 'dhcp6',
            app: {
                name: 'second',
            },
        },
        {
            id: 5,
            name: 'dhcp6',
            app: {
                name: 'third',
            },
        },
    ],
}

let mockUpdateSubnet6BeginData: UpdateSubnetBeginResponse = {
    id: 123,
    subnet: {
        id: 234,
        subnet: '2001:db8:1::/64',
        localSubnets: [
            {
                id: 234,
                appId: 345,
                daemonId: 3,
                appName: 'server 1',
                machineAddress: '10.1.1.1',
                machineHostname: 'myhost.example.org',
                pools: [
                    {
                        pool: '2001:db8:1::10-2001:db8:1::100',
                        keaConfigPoolParameters: {
                            clientClass: 'foo',
                            requireClientClasses: ['foo', 'bar'],
                            options: [],
                            optionsHash: '',
                        },
                    },
                ],
                keaConfigSubnetParameters: {
                    subnetLevelParameters: {
                        allocator: 'random',
                        options: [
                            {
                                alwaysSend: true,
                                code: 23,
                                encapsulate: '',
                                fields: [
                                    {
                                        fieldType: 'ipv6-address',
                                        values: ['2001:db8:2::6789'],
                                    },
                                ],
                                options: [],
                                universe: 6,
                            },
                        ],
                        optionsHash: '123',
                    },
                },
            },
            {
                id: 345,
                appId: 456,
                daemonId: 4,
                appName: 'server 2',
                machineAddress: '10.1.1.1.',
                machineHostname: 'myhost.example.org',
                pools: [
                    {
                        pool: '2001:db8:1::10-2001:db8:1::100',
                        keaConfigPoolParameters: {
                            clientClass: 'foo',
                            requireClientClasses: ['foo', 'bar'],
                            options: [],
                            optionsHash: '',
                        },
                    },
                ],
                keaConfigSubnetParameters: {
                    subnetLevelParameters: {
                        pdAllocator: 'iterative',
                        options: [
                            {
                                alwaysSend: true,
                                code: 23,
                                encapsulate: '',
                                fields: [
                                    {
                                        fieldType: 'ipv6-address',
                                        values: ['2001:db8:2::6789'],
                                    },
                                ],
                                options: [],
                                universe: 6,
                            },
                        ],
                        optionsHash: '123',
                    },
                },
            },
        ],
    },
    daemons: [
        {
            id: 1,
            name: 'dhcp4',
            app: {
                name: 'first',
            },
        },
        {
            id: 3,
            name: 'dhcp6',
            app: {
                name: 'first',
            },
        },
        {
            id: 2,
            name: 'dhcp4',
            app: {
                name: 'second',
            },
        },
        {
            id: 4,
            name: 'dhcp6',
            app: {
                name: 'second',
            },
        },
        {
            id: 5,
            name: 'dhcp6',
            app: {
                name: 'third',
            },
        },
    ],
}

export default {
    title: 'App/SubnetForm',
    component: SubnetFormComponent,
    decorators: [
        moduleMetadata({
            imports: [
                ButtonModule,
                CheckboxModule,
                ChipsModule,
                DividerModule,
                DropdownModule,
                FieldsetModule,
                FormsModule,
                HttpClientModule,
                InputNumberModule,
                MessagesModule,
                MultiSelectModule,
                NoopAnimationsModule,
                TableModule,
                TagModule,
                TriStateCheckboxModule,
                OverlayPanelModule,
                ProgressSpinnerModule,
                ReactiveFormsModule,
                RouterTestingModule,
                SplitButtonModule,
                ToastModule,
            ],
            declarations: [
                DhcpClientClassSetFormComponent,
                DhcpOptionFormComponent,
                DhcpOptionSetFormComponent,
                EntityLinkComponent,
                HelpTipComponent,
                SharedParametersFormComponent,
                SubnetFormComponent,
            ],
            providers: [MessageService],
        }),
        toastDecorator,
    ],
    parameters: {
        mockData: [
            {
                url: 'http://localhost/api/subnets/123/transaction',
                method: 'POST',
                status: 200,
                delay: 2000,
                response: mockUpdateSubnet4BeginData,
            },
            {
                url: 'http://localhost/api/subnets/234/transaction',
                method: 'POST',
                status: 200,
                delay: 2000,
                response: mockUpdateSubnet6BeginData,
            },
            {
                url: 'http://localhost/api/subnets/345/transaction',
                method: 'POST',
                status: 400,
                delay: 2000,
                response: mockUpdateSubnet4BeginData,
            },
        ],
    },
} as Meta

const Template: Story<SubnetFormComponent> = (args: SubnetFormComponent) => ({
    props: args,
})

export const UpdatedSubnet4 = Template.bind({})
UpdatedSubnet4.args = {
    subnetId: 123,
}

export const UpdatedSubnet6 = Template.bind({})
UpdatedSubnet6.args = {
    subnetId: 234,
}

export const NoSubnetId = Template.bind({})
NoSubnetId.args = {}

export const ErrorMessage = Template.bind({})
ErrorMessage.args = {
    subnetId: 345,
}