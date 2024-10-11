import { ComponentFixture, TestBed } from '@angular/core/testing'

import { VersionPageComponent } from './version-page.component'
import { HttpClientTestingModule } from '@angular/common/http/testing'
import { MessageService } from 'primeng/api'
import { BreadcrumbModule } from 'primeng/breadcrumb'
import { BreadcrumbsComponent } from '../breadcrumbs/breadcrumbs.component'
import { PanelModule } from 'primeng/panel'
import { TableModule } from 'primeng/table'
import { HelpTipComponent } from '../help-tip/help-tip.component'
import { OverlayPanelModule } from 'primeng/overlaypanel'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { ButtonModule } from 'primeng/button'
import { RouterModule } from '@angular/router'
import { Severity, VersionAlert, VersionService } from '../version.service'
import { of } from 'rxjs'
import { ServicesService } from '../backend'
import { MessagesModule } from 'primeng/messages'
import { BadgeModule } from 'primeng/badge'
import { By } from '@angular/platform-browser'

describe('VersionPageComponent', () => {
    let component: VersionPageComponent
    let fixture: ComponentFixture<VersionPageComponent>
    let versionService: VersionService
    let servicesApi: ServicesService
    let getCurrentDataSpy: jasmine.Spy<any>
    let getDataManufactureDateSpy: jasmine.Spy<any>
    let isOnlineDataSpy: jasmine.Spy<any>
    let getVersionAlertSpy: jasmine.Spy<any>
    let getMachinesAppsVersionsSpy: jasmine.Spy<any>
    let fakeResponse = {
        bind9: {
            currentStable: [
                {
                    eolDate: '2026-07-01',
                    esv: 'true',
                    major: 9,
                    minor: 18,
                    range: '9.18.x',
                    releaseDate: '2024-09-18',
                    status: 'Current Stable',
                    version: '9.18.30',
                },
                {
                    eolDate: '2028-07-01',
                    major: 9,
                    minor: 20,
                    range: '9.20.x',
                    releaseDate: '2024-09-18',
                    status: 'Current Stable',
                    version: '9.20.2',
                },
            ],
            latestDev: { major: 9, minor: 21, releaseDate: '2024-09-18', status: 'Development', version: '9.21.1' },
            sortedStables: ['9.18.30', '9.20.2'],
        },
        date: '2024-10-03',
        kea: {
            currentStable: [
                {
                    eolDate: '2026-07-01',
                    major: 2,
                    minor: 6,
                    range: '2.6.x',
                    releaseDate: '2024-07-31',
                    status: 'Current Stable',
                    version: '2.6.1',
                },
                {
                    eolDate: '2025-07-01',
                    major: 2,
                    minor: 4,
                    range: '2.4.x',
                    releaseDate: '2023-11-29',
                    status: 'Current Stable',
                    version: '2.4.1',
                },
            ],
            latestDev: { major: 2, minor: 7, releaseDate: '2024-09-25', status: 'Development', version: '2.7.3' },
            sortedStables: ['2.4.1', '2.6.1'],
        },
        stork: {
            currentStable: null,
            latestDev: { major: 1, minor: 19, releaseDate: '2024-10-02', status: 'Development', version: '1.19.0' },
            latestSecure: {
                major: 1,
                minor: 15,
                releaseDate: '2024-03-27',
                status: 'Security update',
                version: '1.15.1',
            },
            sortedStables: null,
        },
    }
    let fakeMachinesResponse = {
        items: [
            {
                address: 'agent-kea', // warn
                agentPort: 8888,
                agentVersion: '1.19.0',
                apps: [
                    {
                        accessPoints: null,
                        details: {
                            daemons: [
                                { backends: null, files: null, hooks: null, id: 12, logTargets: null, name: 'd2' },
                                { backends: null, files: null, hooks: null, id: 14, logTargets: null, name: 'dhcp6' },
                                {
                                    active: true,
                                    backends: null,
                                    files: null,
                                    hooks: null,
                                    id: 13,
                                    logTargets: null,
                                    name: 'dhcp4',
                                    version: '2.7.2',
                                },
                                {
                                    active: true,
                                    backends: null,
                                    files: null,
                                    hooks: null,
                                    id: 11,
                                    logTargets: null,
                                    name: 'ca',
                                    version: '2.7.2',
                                },
                            ],
                        },
                        id: 4,
                        name: 'kea@agent-kea',
                        type: 'kea',
                        version: '2.7.2',
                    },
                ],
                hostname: 'agent-kea',
                id: 4,
            },
            {
                address: 'agent-bind9', // success
                agentPort: 8883,
                agentVersion: '1.19.0',
                apps: [
                    {
                        accessPoints: null,
                        details: { daemons: null },
                        id: 9,
                        name: 'bind9@agent-bind9',
                        type: 'bind9',
                        version: 'BIND 9.18.30 (Extended Support Version) <id:cdc8d69>',
                    },
                ],
                hostname: 'agent-bind9',
                id: 9,
            },
            {
                address: 'agent-kea-ha2', // info
                agentPort: 8885,
                agentVersion: '1.19.0',
                apps: [
                    {
                        accessPoints: null,
                        details: {
                            daemons: [
                                { backends: null, files: null, hooks: null, id: 23, logTargets: null, name: 'd2' },
                                { backends: null, files: null, hooks: null, id: 25, logTargets: null, name: 'dhcp6' },
                                {
                                    active: true,
                                    backends: null,
                                    files: null,
                                    hooks: null,
                                    id: 24,
                                    logTargets: null,
                                    name: 'dhcp4',
                                    version: '2.6.0',
                                },
                                {
                                    active: true,
                                    backends: null,
                                    files: null,
                                    hooks: null,
                                    id: 26,
                                    logTargets: null,
                                    name: 'ca',
                                    version: '2.6.0',
                                },
                            ],
                        },
                        id: 7,
                        name: 'kea@agent-kea-ha2',
                        type: 'kea',
                        version: '2.6.0',
                    },
                ],
                hostname: 'agent-kea-ha2',
                id: 7,
            },
            {
                address: 'agent-kea6', // err
                agentPort: 8887,
                agentVersion: '1.19.0',
                apps: [
                    {
                        accessPoints: null,
                        details: {
                            daemons: [
                                {
                                    active: true,
                                    backends: null,
                                    files: null,
                                    hooks: null,
                                    id: 2,
                                    logTargets: null,
                                    name: 'dhcp6',
                                    version: '2.7.0',
                                },
                                {
                                    active: true,
                                    backends: null,
                                    files: null,
                                    hooks: null,
                                    id: 1,
                                    logTargets: null,
                                    name: 'ca',
                                    version: '2.7.1',
                                },
                            ],
                            mismatchingDaemons: true,
                        },
                        id: 1,
                        name: 'kea@agent-kea6',
                        type: 'kea',
                        version: '2.7.0',
                    },
                ],
                hostname: 'agent-kea6',
                id: 1,
            },
        ],
        total: 4,
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [
                HttpClientTestingModule,
                PanelModule,
                TableModule,
                BreadcrumbModule,
                OverlayPanelModule,
                BrowserAnimationsModule,
                ButtonModule,
                RouterModule.forRoot([
                    {
                        path: 'versions',
                        component: VersionPageComponent,
                    },
                ]),
                MessagesModule,
                BadgeModule,
            ],
            declarations: [VersionPageComponent, BreadcrumbsComponent, HelpTipComponent],
            providers: [MessageService],
        }).compileComponents()
        fixture = TestBed.createComponent(VersionPageComponent)
        versionService = TestBed.inject(VersionService)
        servicesApi = TestBed.inject(ServicesService)
        component = fixture.componentInstance
        getCurrentDataSpy = spyOn(versionService, 'getCurrentData')
        getCurrentDataSpy.and.returnValue(of(fakeResponse))
        getDataManufactureDateSpy = spyOn(versionService, 'getDataManufactureDate').and.returnValue(of('2024-10-03'))
        isOnlineDataSpy = spyOn(versionService, 'isOnlineData').and.returnValue(of(false))
        getVersionAlertSpy = spyOn(versionService, 'getVersionAlert')
        getVersionAlertSpy.and.returnValue(of({ severity: Severity.error, detected: true } as VersionAlert))
        getMachinesAppsVersionsSpy = spyOn(servicesApi, 'getMachinesAppsVersions').and.returnValue(
            of(fakeMachinesResponse as any)
        )

        fixture.detectChanges()
    })

    it('should create', () => {
        expect(component).toBeTruthy()
    })

    it('should get daemons versions', () => {
        // Arrange
        let app = fakeMachinesResponse.items.filter((m) => m.address === 'agent-kea')[0].apps[0]

        // Act & Assert
        expect(component.getDaemonsVersions(app)).toEqual('dhcp4 2.7.2, ca 2.7.2')
    })

    it('should display offline data info message', () => {
        // Arrange & Act & Assert
        expect(getDataManufactureDateSpy).toHaveBeenCalledTimes(1)
        expect(isOnlineDataSpy).toHaveBeenCalledTimes(1)
        expect(getCurrentDataSpy).toHaveBeenCalledTimes(1)
        expect(getMachinesAppsVersionsSpy).toHaveBeenCalledTimes(1)

        let de = fixture.debugElement.query(By.css('.p-messages.header-message .p-message-info'))
        expect(de).toBeTruthy()
        expect(de.nativeElement.innerText).toContain(
            'Below information about ISC software versions relies on a data that was generated on 2024-10-03.'
        )
    })

    it('should display summary table', () => {
        // Arrange & Act & Assert
        expect(component.machines.length).toEqual(4)

        // There should be 4 tables.
        let tablesDe = fixture.debugElement.queryAll(By.css('table.p-datatable-table'))
        expect(tablesDe.length).toEqual(4)
        let summaryTableDe = tablesDe[0]

        // There should be 4 group headers, one per error, warn, info and success severity.
        expect(summaryTableDe.queryAll(By.css('tbody tr')).length).toEqual(4)
        expect(component.counters).toEqual([1, 1, 1, 0, 1])
        let groupHeaderMessagesDe = summaryTableDe.queryAll(By.css('.p-message'))
        expect(groupHeaderMessagesDe.length).toEqual(4)
        expect(Object.keys(groupHeaderMessagesDe[0].classes)).toContain('p-message-error')
        expect(Object.keys(groupHeaderMessagesDe[1].classes)).toContain('p-message-warn')
        expect(Object.keys(groupHeaderMessagesDe[2].classes)).toContain('p-message-info')
        expect(Object.keys(groupHeaderMessagesDe[3].classes)).toContain('p-message-success')
    })

    it('should display kea releases table', () => {
        // Arrange & Act & Assert
        expect(component.machines.length).toEqual(4)

        // There should be 4 tables.
        let tablesDe = fixture.debugElement.queryAll(By.css('table.p-datatable-table'))
        expect(tablesDe.length).toEqual(4)
        let keaTable = tablesDe[1]

        // There should be 2 rows for stable releases and 1 for development.
        expect(keaTable.queryAll(By.css('tbody tr')).length).toEqual(3)
        expect(keaTable.nativeElement.innerText).toContain('Current Stable')
        expect(keaTable.nativeElement.innerText).toContain('Development')
        expect(keaTable.nativeElement.innerText).toContain('Kea ARM')
        expect(keaTable.nativeElement.innerText).toContain('Release Notes')
    })

    it('should display Bind9 releases table', () => {
        // Arrange & Act & Assert
        expect(component.machines.length).toEqual(4)

        // There should be 4 tables.
        let tablesDe = fixture.debugElement.queryAll(By.css('table.p-datatable-table'))
        expect(tablesDe.length).toEqual(4)
        let bindTable = tablesDe[2]

        // There should be 2 rows for stable releases and 1 for development.
        expect(bindTable.queryAll(By.css('tbody tr')).length).toEqual(3)
        expect(bindTable.nativeElement.innerText).toContain('Current Stable')
        expect(bindTable.nativeElement.innerText).toContain('Development')
        expect(bindTable.nativeElement.innerText).toContain('Bind 9.20 ARM')
        expect(bindTable.nativeElement.innerText).toContain('Release Notes')
    })

    it('should display stork releases table', () => {
        // Arrange & Act & Assert
        expect(component.machines.length).toEqual(4)

        // There should be 4 tables.
        let tablesDe = fixture.debugElement.queryAll(By.css('table.p-datatable-table'))
        expect(tablesDe.length).toEqual(4)
        let storkTable = tablesDe[3]

        // There is 1 row for development release.
        expect(storkTable.queryAll(By.css('tbody tr')).length).toEqual(1)
        expect(storkTable.nativeElement.innerText).toContain('Development')
        expect(storkTable.nativeElement.innerText).toContain('Stork ARM')
        expect(storkTable.nativeElement.innerText).toContain('Release Notes')
    })

    it('should display version alert dismiss message', () => {
        // Arrange & Act & Assert
        let de = fixture.debugElement.query(By.css('.p-messages.header-message .p-message-warn'))
        expect(de).toBeTruthy()
        expect(de.nativeElement.innerText).toContain('Action required')

        // There is a button to dismiss the alert.
        let btn = de.query(By.css('button'))
        expect(btn).toBeTruthy()
        spyOn(versionService, 'dismissVersionAlert').and.callThrough()
        btn.triggerEventHandler('click')
        expect(versionService.dismissVersionAlert).toHaveBeenCalledTimes(1)
    })

    it('should display button to refresh data', () => {
        // Arrange & Act & Assert

        // There is a button to refresh the data.
        let de = fixture.debugElement.query(By.css('p-button[label="Refresh Versions"]'))
        expect(de).toBeTruthy()
        expect(de.nativeElement.innerText).toContain('Refresh Versions')

        let btn = de.query(By.css('button'))
        expect(btn).toBeTruthy()
        spyOn(versionService, 'refreshData').and.callThrough()
        btn.triggerEventHandler('click')
        fixture.detectChanges()
        expect(versionService.refreshData).toHaveBeenCalledTimes(1)
    })
})
