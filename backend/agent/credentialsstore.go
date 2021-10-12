package agent

// Store the agent credentials to Kea CA.
// The data are read from a dedicated JSON file.
//
// It isn't just a map, because I predict that it may change
// a lot in the future.
// For example:
//
// - Credentials may be assigned not to exact IP/port, but
//   to subnetwork.
// - Store may contains different kinds of credentials

import (
	"encoding/json"
	"io"
	"io/ioutil"
	"net"

	"github.com/pkg/errors"
	storkutil "isc.org/stork/util"
)

// Location CA in the network. It is a key of the credentials store.
// It is the internal structure of the credentials store.
type Location struct {
	IP   string
	Port int64
}

// Basic authentication credentials.
type BasicAuthCredentials struct {
	Login    string
	Password string
}

// Credentials store with an API to add/update/delete the content.
type CredentialsStore struct {
	basicAuthCredentials map[Location]*BasicAuthCredentials
}

// Structure of the credentials JSON file.
type CredentialsStoreContent struct {
	Basic []CredentialsStoreContentBasicAuthEntry
}

// Single Basic Auth item of the credentials JSON file.
type CredentialsStoreContentBasicAuthEntry struct {
	Location
	BasicAuthCredentials
}

// Constructor of the credentials store.
func NewCredentialsStore() *CredentialsStore {
	return &CredentialsStore{
		basicAuthCredentials: make(map[Location]*BasicAuthCredentials),
	}
}

// Constructor of the Basic Auth credentials.
func NewBasicAuthCredentials(login, password string) *BasicAuthCredentials {
	return &BasicAuthCredentials{
		Login:    login,
		Password: password,
	}
}

// Get Basic Auth credentials by URL
// The Basic Auth is often used during HTTP calls. It is helper function
// for retrieve the credentials based on the request URL. The URL may contains
// a protocol, URL segments and the query parameters.
func (cs *CredentialsStore) GetBasicAuthByURL(url string) (*BasicAuthCredentials, bool) {
	address, port, _ := storkutil.ParseURL(url)
	return cs.GetBasicAuth(address, port)
}

// Get Basic Auth credentials by the network location (IP address and port).
func (cs *CredentialsStore) GetBasicAuth(address string, port int64) (*BasicAuthCredentials, bool) {
	location, err := newLocation(address, port)
	if err != nil {
		return nil, false
	}
	item, ok := cs.basicAuthCredentials[location]
	return item, ok
}

// Add or update the Basic Auth credentials by the network location (IP address and port).
// If the credentials already exist in the store then they will be override.
func (cs *CredentialsStore) AddOrUpdateBasicAuth(address string, port int64, credentials *BasicAuthCredentials) error {
	location, err := newLocation(address, port)
	if err != nil {
		return err
	}
	cs.basicAuthCredentials[location] = credentials
	return nil
}

// Remove the Basic Auth credentials by the network location (IP address and port).
// If the credentials don't exist then this function does nothing.
func (cs *CredentialsStore) RemoveBasicAuth(address string, port int64) {
	location, err := newLocation(address, port)
	if err != nil {
		return
	}
	delete(cs.basicAuthCredentials, location)
}

// Read the credentials store content from reader.
// The file may contain IP addresses in the different forms,
// they will be converted to canonical forms.
func (cs *CredentialsStore) Read(reader io.Reader) error {
	rawContent, err := ioutil.ReadAll(reader)
	if err != nil {
		return errors.Wrap(err, "cannot read a credentials file")
	}
	var content CredentialsStoreContent
	err = json.Unmarshal(rawContent, &content)
	if err != nil {
		return errors.Wrap(err, "cannot parse a credentials file")
	}
	return cs.loadContent(&content)
}

// Constructor of the network location (IP address and port).
func newLocation(address string, port int64) (Location, error) {
	address, err := normalizeIP(address)
	return Location{
		IP:   address,
		Port: port,
	}, errors.WithMessage(err, "cannot create location object")
}

// Load the content from JSON file to the credentials store.
func (cs *CredentialsStore) loadContent(content *CredentialsStoreContent) error {
	for _, entry := range content.Basic {
		credentials := NewBasicAuthCredentials(entry.Login, entry.Password)
		cs.AddOrUpdateBasicAuth(entry.IP, entry.Port, credentials)
	}
	return nil
}

// Remove any IP address abbreviations. Return error if address
// isn't a valid IP.
func normalizeIP(address string) (string, error) {
	// Abbreviation and letter case normalization
	ipObj := net.ParseIP(address)
	// Validate IP address
	if ipObj == nil {
		return "", errors.Errorf("Invalid IP address: %s", address)
	}
	normalizedIP := ipObj.String()
	return normalizedIP, nil

}
