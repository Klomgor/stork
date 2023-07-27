import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Router, ActivatedRoute, ParamMap } from '@angular/router'

import { Table } from 'primeng/table'

import { DHCPService } from '../backend/api/api'
import { extractKeyValsAndPrepareQueryParams } from '../utils'
import { getTotalAddresses, getAssignedAddresses, parseSubnetsStatisticValues } from '../subnets'
import { Subscription } from 'rxjs'
import { map } from 'rxjs/operators'
import { SharedNetwork } from '../backend'

/**
 * Component for presenting shared networks in a table.
 */
@Component({
    selector: 'app-shared-networks-page',
    templateUrl: './shared-networks-page.component.html',
    styleUrls: ['./shared-networks-page.component.sass'],
})
export class SharedNetworksPageComponent implements OnInit, OnDestroy {
    private subscriptions = new Subscription()
    breadcrumbs = [{ label: 'DHCP' }, { label: 'Shared Networks' }]

    @ViewChild('networksTable') networksTable: Table

    // networks
    networks: SharedNetwork[]
    totalNetworks = 0

    // filters
    filterText = ''
    dhcpVersions: any[]
    queryParams = {
        text: null,
        dhcpVersion: null,
        appId: null,
    }

    constructor(private route: ActivatedRoute, private router: Router, private dhcpApi: DHCPService) {}

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe()
    }

    ngOnInit() {
        // prepare list of DHCP versions, this is used in networks filtering
        this.dhcpVersions = [
            { label: 'any', value: null },
            { label: 'DHCPv4', value: '4' },
            { label: 'DHCPv6', value: '6' },
        ]

        const ssParams = this.route.snapshot.queryParamMap
        let text = ''
        if (ssParams.get('text')) {
            text += ' ' + ssParams.get('text')
        }
        if (ssParams.get('appId')) {
            text += ' appId:' + ssParams.get('appId')
        }
        this.filterText = text.trim()
        this.updateOurQueryParams(ssParams)

        // subscribe to subsequent changes to query params
        this.subscriptions.add(
            this.route.queryParamMap.subscribe(
                (params) => {
                    this.updateOurQueryParams(params)
                    let event = { first: 0, rows: 10 }
                    if (this.networksTable) {
                        event = this.networksTable.createLazyLoadMetadata()
                    }
                    this.loadNetworks(event)
                },
                // ToDo: Silent error catching
                (error) => {
                    console.log(error)
                }
            )
        )
    }

    /**
     * Updates the query parameters stored in the member of this class using
     * query parameters from the router.
     * @param params URL query parameters from router.
     */
    updateOurQueryParams(params: ParamMap) {
        if (['4', '6'].includes(params.get('dhcpVersion'))) {
            this.queryParams.dhcpVersion = params.get('dhcpVersion')
        }
        this.queryParams.text = params.get('text')
        this.queryParams.appId = params.get('appId')
    }

    /**
     * Loads networks from the database into the component.
     *
     * @param event Event object containing index of the first row, maximum number
     *              of rows to be returned, dhcp version and text for networks filtering.
     */
    loadNetworks(event) {
        const params = this.queryParams
        this.dhcpApi
            .getSharedNetworks(event.first, event.rows, params.appId, params.dhcpVersion, params.text)
            .pipe(
                map((sharedNetworks) => {
                    parseSubnetsStatisticValues(sharedNetworks.items)
                    return sharedNetworks
                })
            )
            .subscribe(
                (data) => {
                    this.networks = data.items
                    this.totalNetworks = data.total
                },
                (error) => {
                    console.log(error)
                }
            )
    }

    /**
     * Filters list of networks by DHCP versions. Filtering is realized server-side.
     */
    filterByDhcpVersion() {
        this.router.navigate(['/dhcp/shared-networks'], {
            queryParams: { dhcpVersion: this.queryParams.dhcpVersion },
            queryParamsHandling: 'merge',
        })
    }

    /**
     * Filters list of networks by text. The text may contain key=val
     * pairs allowing filtering by various keys. Filtering is realized
     * server-side.
     */
    keyupFilterText(event) {
        if (this.filterText.length >= 2 || event.key === 'Enter') {
            const queryParams = extractKeyValsAndPrepareQueryParams(this.filterText, ['appId'], null)

            this.router.navigate(['/dhcp/shared-networks'], {
                queryParams,
                queryParamsHandling: 'merge',
            })
        }
    }

    /**
     * Get the total number of addresses in the network.
     */
    getTotalAddresses(network: SharedNetwork) {
        return getTotalAddresses(network)
    }

    /**
     * Get the number of assigned addresses in the network.
     */
    getAssignedAddresses(network: SharedNetwork) {
        return getAssignedAddresses(network)
    }

    /**
     * Get the total number of delegated prefixes in the network.
     */
    getTotalDelegatedPrefixes(network: SharedNetwork) {
        return network.stats?.['total-pds']
    }

    /**
     * Get the number of delegated prefixes in the network.
     */
    getAssignedDelegatedPrefixes(network: SharedNetwork) {
        return network.stats?.['assigned-pds']
    }

    /**
     * Returns a list of applications maintaining a given shared network.
     * The list doesn't contain duplicates.
     *
     * @param net Shared network
     * @returns List of the applications (only ID and app name)
     */
    getApps(net: SharedNetwork) {
        const apps = []
        const appIds = {}

        for (const sn of net.subnets) {
            for (const lsn of sn.localSubnets) {
                if (!appIds.hasOwnProperty(lsn.appId)) {
                    apps.push({ id: lsn.appId, name: lsn.appName })
                    appIds[lsn.appId] = true
                }
            }
        }

        return apps
    }

    /**
     * Returns true if at least one of the shared networks contains at least
     * one IPv6 subnet
     */
    get isAnyIPv6SubnetVisible(): boolean {
        return this.networks.some((n) => n.subnets.some((s) => s.subnet.includes(':')))
    }
}
