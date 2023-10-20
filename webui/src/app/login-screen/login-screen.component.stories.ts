import { Meta, Story, applicationConfig, moduleMetadata } from '@storybook/angular'
import { LoginScreenComponent } from './login-screen.component'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { HttpClientModule } from '@angular/common/http'
import { ProgressSpinnerModule } from 'primeng/progressspinner'
import { AuthenticationMethod, AuthenticationMethods, GeneralService, UsersService, Version } from '../backend'
import { MessageService } from 'primeng/api'
import { toastDecorator } from '../utils-stories'
import { RouterTestingModule } from '@angular/router/testing'
import { ToastModule } from 'primeng/toast'
import { SelectButtonModule } from 'primeng/selectbutton'
import { ButtonModule } from 'primeng/button'
import { action } from '@storybook/addon-actions'
import { importProvidersFrom } from '@angular/core'

export default {
    title: 'App/LoginScreen',
    component: LoginScreenComponent,
    decorators: [
        applicationConfig({
            providers: [GeneralService, UsersService, MessageService, importProvidersFrom(HttpClientModule)],
        }),
        moduleMetadata({
            imports: [
                ReactiveFormsModule,
                FormsModule,
                RouterTestingModule,
                HttpClientModule,
                ProgressSpinnerModule,
                SelectButtonModule,
                ButtonModule,
                ToastModule,
            ],
            declarations: [LoginScreenComponent],
        }),
        toastDecorator,
    ],
    parameters: {
        mockData: [
            {
                url: 'http://localhost/api/version',
                method: 'GET',
                status: 200,
                delay: 1000,
                response: { date: '2023-03-03', version: '1.4.2' } as Version,
            },
            {
                url: 'http://localhost/api/authentication-methods',
                method: 'GET',
                status: 200,
                delay: 2000,
                response: {
                    total: 4,
                    items: [
                        {
                            description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
                            formLabelIdentifier: 'Login/Email',
                            formLabelSecret: 'Password',
                            id: 'internal',
                            name: 'Internal',
                        },
                        {
                            description: 'Fusce faucibus mauris purus, in mattis tellus pellentesque sed.',
                            formLabelIdentifier: 'Login',
                            formLabelSecret: 'Password',
                            id: 'ldap',
                            name: 'LDAP',
                        },
                        {
                            description:
                                'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce eleifend condimentum accumsan. Fusce faucibus mauris purus, in mattis tellus pellentesque sed. Quisque congue eu lacus ut ultrices. Nulla consectetur commodo ante sed blandit. Suspendisse sollicitudin nisl ac ipsum maximus rhoncus. Sed dolor massa, dignissim in luctus at, pulvinar nec mauris. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce eleifend condimentum accumsan. Fusce faucibus mauris purus, in mattis tellus pellentesque sed. Quisque congue eu lacus ut ultrices. Nulla consectetur commodo ante sed blandit. Suspendisse sollicitudin nisl ac ipsum maximus rhoncus. Sed dolor massa, dignissim in luctus at, pulvinar nec mauris. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce eleifend condimentum accumsan. Fusce faucibus mauris purus, in mattis tellus pellentesque sed. Quisque congue eu lacus ut ultrices. Nulla consectetur commodo ante sed blandit. Suspendisse sollicitudin nisl ac ipsum maximus rhoncus. Sed dolor massa, dignissim in luctus at, pulvinar nec mauris.',
                            formLabelIdentifier: 'Lorem',
                            formLabelSecret: 'Ipsum',
                            id: 'dolor',
                            name: 'Sit amet',
                        },
                        {
                            description: 'Fusce eleifend condimentum accumsan.',
                            id: 'passwordless',
                            name: 'Passwordless',
                        },
                    ],
                } as AuthenticationMethods,
            },
        ],
    },
} as Meta

const Template: Story<LoginScreenComponent> = (args: LoginScreenComponent) => ({
    props: args,
})

export const Primary = Template.bind({})

export const Loading = Template.bind({})

Loading.parameters = {
    mockData: [],
}

export const ManyButtons = Template.bind({})
const items: AuthenticationMethod[] = Array(40)
    .fill(0)
    .map((_, i) => ({
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        formLabelIdentifier: `Identifier ${i}`,
        formLabelSecret: `Secret ${i}`,
        id: i % 4 == 0 && i < 20 ? 'internal' : i.toString(),
        name: `Method ${i}`,
    }))

ManyButtons.parameters = {
    mockData: [
        {
            url: 'http://localhost/api/authentication-methods',
            method: 'GET',
            status: 200,
            delay: 0,
            response: {
                total: items.length,
                items,
            } as AuthenticationMethods,
        },
    ],
}

export const SingleMethod = Template.bind({})

SingleMethod.parameters = {
    mockData: [
        {
            url: 'http://localhost/api/authentication-methods',
            method: 'GET',
            status: 200,
            delay: 0,
            response: {
                total: 4,
                items: [
                    {
                        description: 'LDAP',
                        formLabelIdentifier: 'Login',
                        formLabelSecret: 'Password',
                        id: 'ldap',
                        name: 'LDAP',
                    },
                ],
            } as AuthenticationMethods,
        },
    ],
}

export const FailedFetch = Template.bind({})

FailedFetch.parameters = {
    mockData: [
        {
            url: 'http://localhost/api/authentication-methods',
            method: 'GET',
            status: 500,
            delay: 500,
            response: () => {
                action('onFetchAuthenticationMethods')()
            },
        },
    ],
}
