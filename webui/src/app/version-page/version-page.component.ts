import { Component, OnInit } from '@angular/core'
import { App, Severity, VersionDetails, VersionService } from '../version.service'
import { Machine, ServicesService } from '../backend'
import { deepCopy } from '../utils'
import {concat, forkJoin} from "rxjs";

/**
 *
 */
@Component({
    selector: 'app-version-page',
    templateUrl: './version-page.component.html',
    styleUrl: './version-page.component.sass',
})
export class VersionPageComponent implements OnInit {
    keaVersions: VersionDetails[] = []
    bind9Versions: VersionDetails[] = []
    storkVersions: VersionDetails[] = []
    protected readonly SeverityEnum = Severity
    severityMap: Severity[] = [
        Severity.danger,
        Severity.warning,
        Severity.info,
        Severity.success, // SeverityEnum.secondary is mapped to SeverityEnum.success
        Severity.success,
    ]
    dataDate: string = 'unknown'
    subheaderMap = [
        'Security updates were found for ISC software used on those machines!',
        'Those machines use ISC software version that require your attention. Software updates are available.',
        'ISC software updates are available for those machines.',
        '',
        `Those machines use up-to-date ISC software (known as of ${this.dataDate})`,
    ]
    dataLoading: boolean

    machines: Machine[]

    /**
     *
     */
    constructor(
        private versionService: VersionService,
        private servicesApi: ServicesService
    ) {}

    /**
     *
     */
    ngOnInit(): void {
        this.getDate()
        this.dataLoading = true
        // prepare kea data
        forkJoin({
            currentStable: this.versionService.getVersionDetailsAsync('kea', 'currentStable'),
            latestDev: this.versionService.getVersionDetailsAsync('kea', 'latestDev')
        }).subscribe((data)=>{
            this.keaVersions = data.currentStable ? (data.currentStable as VersionDetails[]) : []
            if (data.latestDev) {
                this.keaVersions.push(data.latestDev as VersionDetails)
            }
        })

        // this.versionService.getVersionDetailsAsync('kea', 'currentStable').subscribe(
        //     (details) => {
        //         let keaDetails = deepCopy(details)
        //         this.keaVersions = keaDetails ? (keaDetails as VersionDetails[]) : []
        //         keaDetails = deepCopy(this.versionService.getVersionDetails('kea', 'latestDev'))
        //         if (keaDetails) {
        //             this.keaVersions.push(keaDetails as VersionDetails)
        //         }
        //     }
        // )


        // prepare bind9 data
        // let bindDetails = deepCopy(this.versionService.getVersionDetails('bind9', 'currentStable'))
        // this.bind9Versions = bindDetails ? (bindDetails as VersionDetails[]) : []
        // bindDetails = deepCopy(this.versionService.getVersionDetails('bind9', 'latestDev'))
        // if (bindDetails) {
        //     this.bind9Versions.push(bindDetails as VersionDetails)
        // }
        forkJoin({
            currentStable: this.versionService.getVersionDetailsAsync('bind9', 'currentStable'),
            latestDev: this.versionService.getVersionDetailsAsync('bind9', 'latestDev')
        }).subscribe((data)=>{
            this.bind9Versions = data.currentStable ? (data.currentStable as VersionDetails[]) : []
            if (data.latestDev) {
                this.bind9Versions.push(data.latestDev as VersionDetails)
            }
        })

        // prepare stork data
        // let storkDetails = deepCopy(this.versionService.getVersionDetails('stork', 'currentStable'))
        // this.storkVersions = storkDetails ? (storkDetails as VersionDetails[]) : []
        // storkDetails = deepCopy(this.versionService.getVersionDetails('stork', 'latestDev'))
        // if (storkDetails) {
        //     this.storkVersions.push(storkDetails as VersionDetails)
        // }
        forkJoin({
            currentStable: this.versionService.getVersionDetailsAsync('stork', 'currentStable'),
            latestDev: this.versionService.getVersionDetailsAsync('stork', 'latestDev')
        }).subscribe((data)=>{
            this.storkVersions = data.currentStable ? (data.currentStable as VersionDetails[]) : []
            if (data.latestDev) {
                this.storkVersions.push(data.latestDev as VersionDetails)
            }
        })


        // this.servicesApi.getMachines(0, 100, undefined, undefined, true)
        this.servicesApi.getMachinesAppsVersions().subscribe((data) => {
            this.machines = data.items ?? []
            // // for (let m of this.machines) {
            // //     m.agentVersion = this.storkVers[this.sI++ % this.storkVers.length]
            // //
            // //     m.versionCheckSeverity = Severity.success
            // //     let storkCheck = this.versionService.checkVersion(m.agentVersion, 'stork')
            // //     // TODO: daemons version match check
            // //     if (storkCheck) {
            // //         m.versionCheckSeverity = Math.min(this.severityMap[storkCheck.severity], m.versionCheckSeverity)
            // //     }
            // //
            // //     for (let a of m.apps) {
            // //         if (a.type === 'kea') {
            // //             a.version = this.keaVers[this.kI++ % this.keaVers.length]
            // //             let dV = undefined
            // //             let dIdx = 0
            // //             for (let d of a.details.daemons) {
            // //                 if (dIdx > 0 && dV !== d.version) {
            // //                     console.error('Kea daemons versions mismatch!')
            // //                 }
            // //
            // //                 dV = d.version
            // //                 console.log('kea daemon', dIdx, d.version)
            // //                 dIdx++
            // //             }
            // //         }
            // //         let versionCheck = this.versionService.checkVersion(a.version, a.type as App)
            // //         if (versionCheck) {
            // //             m.versionCheckSeverity = Math.min(
            // //                 this.severityMap[versionCheck.severity],
            // //                 m.versionCheckSeverity
            // //             )
            // //         }
            // //     }
            // }
            this.dataLoading = false
        })
    }

    /**
     * Configures the breadcrumbs for the component.
     */
    breadcrumbs = [{ label: 'Monitoring' }, { label: 'Software versions' }]

    /**
     * Returns true if version data source is offline json file.
     */
    get isDataOffline() {
        return !this.versionService.isOnlineData()
    }

    /**
     *
     */
    get dataManufactureDate() {
        return this.dataDate
    }

    getDate() {
        this.versionService.getDataManufactureDateAsync().subscribe((date)=>this.dataDate = date)
    }
}
