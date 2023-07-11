import { Component, Input, OnInit } from '@angular/core'

/**
 * Allowed types of the parameters displayed in the table.
 */
type CascadedParameterType = string | number | boolean | Array<any> | Object | null

/**
 * Describes a structure holding a parameter with its values at different levels.
 */
interface CascadedParameter {
    level: string
    effective: CascadedParameterType
    values: Array<CascadedParameterType>
}

/**
 * Describes a table row for a single parameter and multiple data sets (e.g., multiple servers).
 */
interface CascadedParameterRow {
    /**
     * Displayed parameter name.
     */
    name: string

    /**
     * An array of parameters for different data sets (e.g., different servers).
     */
    parameters: Array<CascadedParameter>
}

/**
 * A single set of the parameters (e.g., a set of the parameters for a server).
 */
export interface NamedCascadedParameters<T> {
    /**
     * Data set name (e.g., server name displayed in a column header).
     */
    name: string

    /**
     * An array of objects representing the parameters at several inheritance levels.
     *
     * Each object in the array holds many parameters.
     */
    parameters: Array<T>
}

/**
 * A component that displays a multi-dimensional table.
 *
 * The first use case for this component is to display DHCP configuration
 * parameters for a subnet with inheritance from the higher configuration
 * levels. The effective configuration value is the value of a configuration
 * parameter taken from the lowest level where it is specified. For example,
 * if the configuration parameter is specified at the subnet level, it
 * overrides the values of this parameter specified at the shared network
 * and global levels. If the subnet-level value is unspecified, the shared
 * network-level value becomes effective. If the shared network-level value
 * is unspecified, the global value becomes effective. Otherwise, a default
 * value is used.
 *
 * The table displayed by this component contains expandable rows showing the
 * configuration values at all levels. The table columns represent different
 * sets of the parameters (e.g., configuration parameters for the respective
 * servers for a given subnet).
 */
@Component({
    selector: 'app-cascaded-parameters-board',
    templateUrl: './cascaded-parameters-board.component.html',
    styleUrls: ['./cascaded-parameters-board.component.sass'],
})
export class CascadedParametersBoardComponent<T> implements OnInit {
    /**
     * A data structure holding input data.
     *
     * This array holds the parameters for multiple data sets. Each data set
     * can hold all parameters for a particular server. For example, if a subnet
     * is associated with two servers, this array should have two elements.
     *
     * Each array element has a name of the data set (typically a server name),
     * and an array of objects, each object representing a set of the parameters
     * at certain inheritance level (e.g., subnet-level parameters). The size of
     * this array should be equal to the size of the levels array.
     */
    @Input() data: Array<NamedCascadedParameters<T>> = new Array()

    /**
     * Named inheritance levels.
     *
     * For a subnet belonging to a shared network, they can be: Subnet, Shared Network
     * and Global. For a top-level subnet, they can be: Subnet, Global.
     */
    @Input() levels: string[]

    /**
     * Parameter names to be excluded.
     *
     * Specifies an array of parameters to not be shown in the table.
     */
    @Input() excludedParameters: string[]

    /**
     * Parsed data representing displayed rows.
     *
     * An array of rows, each row representing data for a single parameter and multiple
     * data sets (e.g., multiple servers).
     */
    rows: Array<CascadedParameterRow> = new Array()

    /**
     * Lifecycle hook invoked when the component is initialized.
     *
     * It parses input data and stores them as rows that are displayed in the table.
     */
    ngOnInit() {
        // Start with gathering all parameter names. Each data set can contain
        // different set of parameters. Typically, they are similar.
        let keys: Array<string> = new Array()
        // Get parameters from each server.
        for (let parameterSet of this.data) {
            // Get parameters at each inheritance level.
            for (let keySet of parameterSet.parameters) {
                if (keySet == null) {
                    continue
                }
                // Get all parameter names.
                for (let key of Object.keys(keySet)) {
                    // Only add it as a new key when it doesn't exist yet and when it
                    // is not excluded.
                    if (!keys.includes(key) && !this.excludedParameters?.includes(key)) {
                        keys.push(key)
                    }
                }
            }
        }
        if (keys.length === 0) {
            return
        }
        // Iterate over the data sets (e.g., over the servers).
        for (let dataSet of this.data) {
            // For each server find all parameters.
            for (let key of keys) {
                // Find at what level an effective value is specified and what
                // this value is.
                let level: string = null
                let effective: CascadedParameterType = null
                // Collect values at different levels.
                let values: Array<CascadedParameterType> = new Array()
                for (let i = 0; i < dataSet.parameters.length; i++) {
                    // Check if the given data set at the given level has the current parameter.
                    if (Object.keys(dataSet.parameters[i]).includes(key)) {
                        // If it has, get its value.
                        let value = dataSet.parameters[i][key]
                        let formatted: CascadedParameterType = value
                        // Depending on whether it is a primitive or a complex type the
                        // value is formatted differently.
                        if (value == null) {
                            continue
                        } else if (Array.isArray(value)) {
                            formatted = this.formatArray(value)
                        } else if (typeof value === 'object') {
                            formatted = this.formatObject(value)
                        }
                        values.push(formatted)
                        if (effective == null && value != null) {
                            effective = formatted
                            level = this.levels[i]
                        }
                    } else {
                        values.push(null)
                    }
                }
                // Check if we already have the parameter processed for a different data set.
                let parameterName = this.uncamelCase(key)
                let cascadedParameter = this.rows.find((v) => v.name === parameterName)
                if (!cascadedParameter) {
                    // It is the first time we see this parameter. Let's add it.
                    cascadedParameter = {
                        name: parameterName,
                        parameters: new Array(),
                    }
                    this.rows.push(cascadedParameter)
                }
                cascadedParameter.parameters.push({
                    level: level,
                    effective: effective,
                    values: values,
                })
            }
        }
        // Sort the parameters by name.
        this.rows.sort((a: CascadedParameterRow, b: CascadedParameterRow) => {
            return a.name.localeCompare(b.name)
        })
    }

    /**
     * Converts parameter names from camel case to long names.
     *
     * The words in the long names begin with upper case and are separated with
     * space characters. For example: 'cacheThreshold' becomes 'Cache Threshold'.
     *
     * It also handles several special cases. When the converted name begins with:
     * - ddns - it is converted to DDNS,
     * - pd - it is converted to PD,
     * - ip - it is converted to IP,
     * - underscore character - it is removed.
     *
     * @param key a name to be converted in camel case notation.
     * @returns converted name.
     */
    private uncamelCase(key: string): string {
        let text = key.trim().replace(/_/g, '')
        if (text.length === 0) {
            return key
        }
        text = text.replace(/([A-Z]+)/g, ' $1')
        text = text.replace(/^ddns/g, 'DDNS')
        text = text.replace(/^pd/g, 'PD')
        text = text.replace(/^ip/g, 'IP')
        text = text.charAt(0).toUpperCase() + text.slice(1)
        return text
    }

    /**
     * Formats an array parameter for display.
     *
     * A formatted array is surrounded by square brackets. The elements are separated
     * with a comma and a space character.
     *
     * @param value an array value to be formatted.
     * @returns formatted value.
     */
    private formatArray(value: CascadedParameterType): CascadedParameterType {
        return Array.isArray(value) ? '[ ' + value.join(', ') + ' ]' : value
    }

    /**
     * Formats an object for display.
     *
     * The object keys are converted from the camel case to long names.
     *
     * @param value an object to be formatted
     * @returns fomatted value as a string.
     */
    private formatObject(value: CascadedParameterType): CascadedParameterType {
        return JSON.stringify(
            value,
            (key, val) => {
                if (typeof val === 'object' && !Array.isArray(val)) {
                    for (let k of Object.keys(val)) {
                        // Replace the original key with a long name.
                        let newKey = this.uncamelCase(k)
                        val[newKey] = val[k]
                        delete val[k]
                    }
                    return val
                }
                return val
            },
            ' '
        ).replace(/\"/g, '')
    }
}
