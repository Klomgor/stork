import { moduleMetadata, Meta, Story, applicationConfig } from '@storybook/angular'
import { SettingsPageComponent } from './settings-page.component'
import { importProvidersFrom } from '@angular/core'
import { provideAnimations, provideNoopAnimations } from '@angular/platform-browser/animations'
import { BreadcrumbModule } from 'primeng/breadcrumb'
import { FieldsetModule } from 'primeng/fieldset'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MessagesModule } from 'primeng/messages'
import { OverlayPanelModule } from 'primeng/overlaypanel'
import { RouterTestingModule } from '@angular/router/testing'
import { BreadcrumbsComponent } from '../breadcrumbs/breadcrumbs.component'
import { HelpTipComponent } from '../help-tip/help-tip.component'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { DividerModule } from 'primeng/divider'
import { Settings } from '../backend/model/settings'
import { HttpClientModule } from '@angular/common/http'
import { toastDecorator } from '../utils-stories'
import { ToastModule } from 'primeng/toast'

let mockGetSettingsResponse: Settings = {
    bind9StatsPullerInterval: 10,
    grafanaUrl: 'http://grafana.org',
    keaHostsPullerInterval: 12,
    keaStatsPullerInterval: 15,
    keaStatusPullerInterval: 23,
    appsStatePullerInterval: 44,
    prometheusUrl: 'http://prometheus.org',
    metricsCollectorInterval: 11,
}

export default {
    title: 'App/SettingsPage',
    component: SettingsPageComponent,
    decorators: [
        applicationConfig({
            providers: [
                MessageService,
                importProvidersFrom(HttpClientModule),
                provideNoopAnimations(),
                provideAnimations(),
            ],
        }),
        moduleMetadata({
            imports: [
                BreadcrumbModule,
                ButtonModule,
                DividerModule,
                FieldsetModule,
                FormsModule,
                MessagesModule,
                OverlayPanelModule,
                ReactiveFormsModule,
                RouterTestingModule,
                ToastModule,
            ],
            declarations: [BreadcrumbsComponent, HelpTipComponent, SettingsPageComponent],
        }),
        toastDecorator,
    ],
    parameters: {
        mockData: [
            {
                url: 'http://localhost/api/settings',
                method: 'GET',
                status: 200,
                delay: 0,
                response: mockGetSettingsResponse,
            },
            {
                url: 'http://localhost/api/settings',
                method: 'PUT',
                status: 200,
                delay: 0,
                response: {},
            },
        ],
    },
} as Meta

const Template: Story<SettingsPageComponent> = (args: SettingsPageComponent) => ({
    props: args,
})

export const SettingsForm = Template.bind({})
