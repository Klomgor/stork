package keaconfig

import (
	"encoding/json"
	"reflect"
	"strings"

	"github.com/mitchellh/mapstructure"
	"github.com/pkg/errors"
)

const (
	localhost      string = "localhost"
	RootNameDHCPv4 string = "Dhcp4"
	RootNameDHCPv6 string = "Dhcp6"
)

// Kea daemon configuration map. It comprises a set of functions
// which retrieve complex data structures from the configuration.
type Map map[string]interface{}

// Structure representing a configuration of the single hooks library.
type HooksLibrary struct {
	Library    string
	Parameters map[string]interface{}
}

// Structure representing output_options for a logger.
type LoggerOutputOptions struct {
	Output string
}

// Structure representing a single logger configuration.
type Logger struct {
	Name          string
	OutputOptions []LoggerOutputOptions `mapstructure:"output_options"`
	Severity      string
	DebugLevel    int `mapstructure:"debuglevel"`
}

// Structure representing a configuration of a HA peer.
type Peer struct {
	Name         *string
	URL          *string
	Role         *string
	AutoFailover *bool `mapstructure:"auto-failover"`
}

// Structure representing a configuration of the HA hooks library.
type HA struct {
	ThisServerName    *string `mapstructure:"this-server-name"`
	Mode              *string
	HeartbeatDelay    *int `mapstructure:"heartbeat-delay"`
	MaxResponseDelay  *int `mapstructure:"max-response-delay"`
	MaxAckDelay       *int `mapstructure:"max-ack-delay"`
	MaxUnackedClients *int `mapstructure:"max-unacked-clients"`
	Peers             []Peer
}

// Structure representing a configuration of the control socket in the
// Kea Control Agent.
type ControlSocket struct {
	SocketName string `mapstructure:"socket-name"`
	SocketType string `mapstructure:"socket-type"`
}

// Structure representing configuration of multiple control sockets in
// in the Kea Control Agent.
type ControlSockets struct {
	D2      *ControlSocket
	Dhcp4   *ControlSocket
	Dhcp6   *ControlSocket
	NetConf *ControlSocket
}

// Structure representing database connection parameters. It is common
// for all supported backend types.
type Database struct {
	Path string `mapstructure:"path"`
	Type string `mapstructure:"type"`
	Name string `mapstructure:"name"`
	Host string `mapstructure:"host"`
}

// Structure holding all possible database configurations in the Kea
// configuration structure, i.e. lease database, hosts databases,
// config backend and forensic logging database. If some of the
// configurations are not present, nil values or empty slices are
// returned for them. This structure is returned by functions parsing
// Kea configurations to find present database configurations.
type Databases struct {
	Lease    *Database
	Hosts    []Database
	Config   []Database
	Forensic *Database
}

// A structure comprising host reservation modes at the particular
// configuration level. This structure can be embedded in the
// structures for decoding subnets and shared networks. In that
// case, the reservation modes configured at the subnet or shared
// network lebel will be decoded into the embedded structure.
// Do not read the decoded modes directly from the structure.
// Call appropriate functions on this structure to test the
// decoded modes. The Deprecated field holds the value of the
// reservation-mode setting that was deprecated since Kea 1.9.x.
type ReservationModes struct {
	OutOfPool  *bool   `mapstructure:"reservations-out-of-pool,omitempty"`
	InSubnet   *bool   `mapstructure:"reservations-in-subnet,omitempty"`
	Global     *bool   `mapstructure:"reservations-global,omitempty"`
	Deprecated *string `mapstructure:"reservation-mode,omitempty"`
}

// Creates new instance from the pointer to the map of interfaces.
func New(rawCfg *map[string]interface{}) *Map {
	newCfg := Map(*rawCfg)
	return &newCfg
}

// Create new instance from the configuration provided as JSON text.
func NewFromJSON(rawCfg string) (*Map, error) {
	var cfg Map
	err := json.Unmarshal([]byte(rawCfg), &cfg)
	if err != nil {
		err := errors.Wrapf(err, "problem with parsing JSON text: %s", rawCfg)
		return nil, err
	}
	return &cfg, nil
}

// Returns name of the root configuration node, e.g. Dhcp4.
// The second returned value designates whether the root node
// name was successfully found or not.
func (c *Map) GetRootName() (string, bool) {
	// This map will typically hold just a single element, but
	// in the past Kea supported Logging parameter aside of the
	// DHCP server configuration so we need to eliminate this one.
	for key := range *c {
		if key != "Logging" {
			return key, true
		}
	}
	return "", false
}

// Returns root node of the Kea configuration.
func (c *Map) getRootNode() (rootNode map[string]interface{}, ok bool) {
	rootName, rootNameOk := c.GetRootName()
	if !rootNameOk {
		return rootNode, rootNameOk
	}
	if cfg, rootNodeOk := (*c)[rootName]; rootNodeOk {
		rootNode, ok = cfg.(map[string]interface{})
	}
	return rootNode, ok
}

// Returns a list found at the top level of the configuration under
// a given name. If the given parameter does not exist or it is
// not a list, the ok value returned is set to false.
func (c *Map) GetTopLevelList(name string) (list []interface{}, ok bool) {
	if rootNode, ok := c.getRootNode(); ok {
		if listNode, ok := rootNode[name].([]interface{}); ok {
			return listNode, ok
		}
	}
	return list, ok
}

// Returns a map found at the top level of the configuration under a
// given name. If the given parameter does not exist or it is not
// a map, the ok value returned is set to false.
func (c *Map) GetTopLevelMap(name string) (m map[string]interface{}, ok bool) {
	if rootNode, ok := c.getRootNode(); ok {
		if mapNode, ok := rootNode[name].(map[string]interface{}); ok {
			return mapNode, ok
		}
	}
	return m, false
}

// Returns a list of all hooks libraries found in the configuration.
func (c *Map) GetHooksLibraries() (parsedLibraries []HooksLibrary) {
	if hooksLibrariesList, ok := c.GetTopLevelList("hooks-libraries"); ok {
		_ = mapstructure.Decode(hooksLibrariesList, &parsedLibraries)
	}
	return parsedLibraries
}

// Returns the information about a hooks library having a specified name
// if it exists in the configuration. The name parameter designates the
// name of the library, e.g. libdhcp_ha. The returned values include the
// path to the library, library configuration and the flag indicating
// whether the library exists or not.
func (c *Map) GetHooksLibrary(name string) (path string, params map[string]interface{}, ok bool) {
	libraries := c.GetHooksLibraries()
	for _, lib := range libraries {
		if strings.Contains(lib.Library, name) {
			path = lib.Library
			params = lib.Parameters
			ok = true
		}
	}
	return path, params, ok
}

// Returns configuration of the HA hooks library in a parsed form.
func (c *Map) GetHAHooksLibrary() (path string, params HA, ok bool) {
	path, paramsMap, ok := c.GetHooksLibrary("libdhcp_ha")
	if !ok {
		return path, params, ok
	}

	// HA hooks library should contain high-availability parameter being a
	// single element list. If it doesn't exist, it is an error.
	if haParamsList, ok := paramsMap["high-availability"].([]interface{}); !ok {
		path = ""
	} else {
		// Parse the list of HA configurations into a list of structures.
		var paramsList []HA
		err := mapstructure.Decode(haParamsList, &paramsList)
		if err != nil || len(paramsList) == 0 {
			path = ""
		} else {
			// HA configuration found, return it.
			params = paramsList[0]
		}
	}

	return path, params, ok
}

// Checks if the mandatory peer parameters are set. It doesn't check if the
// values are correct.
func (p Peer) IsSet() bool {
	return p.Name != nil && p.URL != nil && p.Role != nil
}

// Checks if the mandatory Kea HA configuration parameters are set. It doesn't
// check parameters consistency, though.
func (c HA) IsSet() bool {
	// Check if peers are valid.
	for _, p := range c.Peers {
		if !p.IsSet() {
			return false
		}
	}
	// Check other required parameters.
	return c.ThisServerName != nil && c.Mode != nil
}

// Parses a list of loggers specified for the server.
func (c *Map) GetLoggers() (parsedLoggers []Logger) {
	if loggersList, ok := c.GetTopLevelList("loggers"); ok {
		_ = mapstructure.Decode(loggersList, &parsedLoggers)
	}
	return parsedLoggers
}

// Parses a map of control sockets in Kea Control Agent.
func (c *Map) GetControlSockets() (parsedSockets ControlSockets) {
	if socketsMap, ok := c.GetTopLevelMap("control-sockets"); ok {
		_ = mapstructure.Decode(socketsMap, &parsedSockets)
	}
	return parsedSockets
}

// Returns a list of daemons for which sockets have been configured.
func (sockets ControlSockets) ConfiguredDaemonNames() (names []string) {
	s := reflect.ValueOf(&sockets).Elem()
	t := s.Type()
	for i := 0; i < s.NumField(); i++ {
		if !s.Field(i).IsNil() {
			names = append(names, strings.ToLower(t.Field(i).Name))
		}
	}
	return names
}

// Convenience function extracting database connection information at the
// certain scope level. The first argument is the map structure containing
// the map under specified name. This map should contain the database
// connection information to be returned. If that map doesn't exist, a nil
// value is returned. This function can be used to extract the values of the
// lease-database and legal logging configurations.
func getDatabase(scope map[string]interface{}, name string) *Database {
	if databaseNode, ok := scope[name]; ok {
		database := Database{}
		_ = mapstructure.Decode(databaseNode, &database)
		// Set default host value.
		if len(database.Host) == 0 {
			database.Host = localhost
		}
		return &database
	}
	return nil
}

// Convenience function extracting an array of the database connection
// information at the certain scope level. The first argument is the map
// structure containing the list under specified name. This list should
// contain zero, one or more maps with database connection information
// to be returned. If that map doesn't exist an empty slice is returned.
// This function can be used to extract values of hosts-databases and
// config-databases lists.
func getDatabases(scope map[string]interface{}, name string) (databases []Database) {
	if databaseNode, ok := scope[name]; ok {
		_ = mapstructure.Decode(databaseNode, &databases)
		// Set default host value.
		for i := range databases {
			if len(databases[i].Host) == 0 {
				databases[i].Host = localhost
			}
		}
	}
	return databases
}

// It returns all database backend configurations found in the Kea configuration.
// It includes lease-database, host-database or hosts-databases, config-databases
// and the database used by the Legal Log hooks library.
func (c *Map) GetAllDatabases() (databases Databases) {
	rootNode, ok := c.getRootNode()
	if !ok {
		return databases
	}
	// lease-database
	databases.Lease = getDatabase(rootNode, "lease-database")
	// hosts-database
	hostsDatabase := getDatabase(rootNode, "hosts-database")
	if hostsDatabase == nil {
		// hosts-database is empty, but hosts-databases can contain
		// multiple entries.
		databases.Hosts = getDatabases(rootNode, "hosts-databases")
	} else {
		// hosts-database was not empty, so append this single
		// element.
		databases.Hosts = append(databases.Hosts, *hostsDatabase)
	}
	// config-databases
	if configControl, ok := rootNode["config-control"].(map[string]interface{}); ok {
		databases.Config = getDatabases(configControl, "config-databases")
	}
	// Forensic Logging hooks library configuration.
	if _, legalParams, ok := c.GetHooksLibrary("libdhcp_legal_log"); ok {
		database := Database{}
		_ = mapstructure.Decode(legalParams, &database)
		// Set default host value.
		if len(database.Path) == 0 && len(database.Host) == 0 {
			database.Host = localhost
		}
		databases.Forensic = &database
	}
	return databases
}

// Checks if the global reservation mode has been enabled.
// Returns (first parameter):
// - reservations-global value if set OR
// - true when reservation-mode is "global".
// The second parameter indicates whether the returned value was set
// explicitly (when true) or is a default value (when false).
func (modes *ReservationModes) IsGlobal() (bool, bool) {
	if modes.Global != nil {
		return *modes.Global, true
	}
	if modes.Deprecated != nil {
		return *modes.Deprecated == "global", true
	}
	return false, false
}

// Checks if the in-subnet reservation mode has been enabled.
// Returns (first parameter):
// - reservations-in-subnet value if set OR
// - true when reservation-mode is set and is "all" or "out-of-pool" OR
// - false when reservation-mode is set and configured to other values OR
// - true when no mode is explicitly configured.
// The second parameter indicates whether the returned value was set
// explicitly (when true) or is a default value (when false).
func (modes *ReservationModes) IsInSubnet() (bool, bool) {
	if modes.InSubnet != nil {
		return *modes.InSubnet, true
	}
	if modes.Deprecated != nil {
		return *modes.Deprecated == "all" || *modes.Deprecated == "out-of-pool", true
	}
	return true, false
}

// Checks if the out-of-pool reservation mode has been enabled.
// Returns (first parameter):
// - reservations-out-of-pool value if set OR,
// - true when reservation-mode is "out-of-pool",
// - false otherwise.
// The second parameter indicates whether the returned value was set
// explicitly (when true) or is a default value (when false).
func (modes *ReservationModes) IsOutOfPool() (bool, bool) {
	if modes.OutOfPool != nil {
		return *modes.OutOfPool, true
	}
	if modes.Deprecated != nil {
		return *modes.Deprecated == "out-of-pool", true
	}
	return false, false
}

// Parses and returns top-level reservation modes.
func (c *Map) GetGlobalReservationModes() *ReservationModes {
	rootNode, ok := c.getRootNode()
	if !ok {
		return nil
	}
	modes := &ReservationModes{}
	_ = decode(rootNode, modes)

	return modes
}
