package agent

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	storkutil "isc.org/stork/util"
)

// Check that HTTP client sets the TLS credentials if available.
func TestCreateHTTPClientWithClientCerts(t *testing.T) {
	cleanup, err := GenerateSelfSignedCerts()
	require.NoError(t, err)
	defer cleanup()

	client, err := NewHTTPClient(false)
	require.NoError(t, err)
	require.NotNil(t, client)

	transport := client.client.Transport.(*http.Transport)
	require.NotNil(t, transport)
	require.NotNil(t, transport.TLSClientConfig)

	transportConfig := transport.TLSClientConfig
	require.False(t, transportConfig.InsecureSkipVerify)

	require.NotNil(t, transportConfig.RootCAs)
	require.NotNil(t, transportConfig.Certificates)

	require.NotNil(t, client.credentials)
}

// Check that HTTP client doesn't set the TLS credentials if missing
// (for example in the unit tests).
func TestCreateHTTPClientWithoutClientCerts(t *testing.T) {
	cleanup := RememberPaths()
	defer cleanup()

	KeyPEMFile = "/not/exists/path"
	CertPEMFile = "/not/exists/path"
	RootCAFile = "/not/exists/path"
	AgentTokenFile = "/not/exists/path"

	client, err := NewHTTPClient(false)
	require.NotNil(t, client)
	require.NoError(t, err)

	transport := client.client.Transport.(*http.Transport)
	require.NotNil(t, transport)
	require.NotNil(t, transport.TLSClientConfig)

	transportConfig := transport.TLSClientConfig
	require.False(t, transportConfig.InsecureSkipVerify)

	require.Nil(t, transportConfig.RootCAs)
	require.Nil(t, transportConfig.Certificates)
}

// Check that HTTP client may be set to skip a server
// credentials validation.
func TestCreateHTTPClientSkipVerification(t *testing.T) {
	client, err := NewHTTPClient(true)
	require.NotNil(t, client)
	require.NoError(t, err)

	transport := client.client.Transport.(*http.Transport)
	require.NotNil(t, transport)
	require.NotNil(t, transport.TLSClientConfig)

	transportConfig := transport.TLSClientConfig
	require.True(t, transportConfig.InsecureSkipVerify)
}

// Test that an authorization header is added to the HTTP request
// when the credentials file contains the credentials for specific
// network location.
func TestAddAuthorizationHeaderWhenBasicAuthCredentialsExist(t *testing.T) {
	restorePaths := RememberPaths()
	defer restorePaths()

	// Create temp dir
	tmpDir, err := os.MkdirTemp("", "reg")
	require.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Prepare test server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headerContent := r.Header.Get("Authorization")
		require.NotEmpty(t, headerContent)
		require.True(t, strings.HasPrefix(headerContent, "Basic "))
		secret := strings.TrimPrefix(headerContent, "Basic ")
		rawCredentials, err := base64.StdEncoding.DecodeString(secret)
		require.NoError(t, err)
		parts := strings.Split(string(rawCredentials), ":")
		require.Len(t, parts, 2)
		user := parts[0]
		password := parts[1]
		require.EqualValues(t, "foo", user)
		require.EqualValues(t, "bar", password)
	}))
	defer ts.Close()

	serverURL := ts.URL
	serverIP, serverPort, _ := storkutil.ParseURL(serverURL)

	// Create credentials file
	CredentialsFile = path.Join(tmpDir, "credentials.json")
	content := fmt.Sprintf(`{
		"basic_auth": [
			{
				"ip": "%s",
				"port": %d,
				"user": "foo",
				"password": "bar"
			}
		]
	}`, serverIP, serverPort)
	err = os.WriteFile(CredentialsFile, []byte(content), 0o600)
	require.NoError(t, err)

	// Create HTTP Client
	client, err := NewHTTPClient(true)
	require.NotNil(t, client.credentials)
	require.NoError(t, err)

	res, err := client.Call(ts.URL, bytes.NewBuffer([]byte{}))
	require.NoError(t, err)
	defer res.Body.Close()
}

// Test that an authorization header isn't added to the HTTP request
// when the credentials file doesn't exist.
func TestAddAuthorizationHeaderWhenBasicAuthCredentialsNonExist(t *testing.T) {
	restorePaths := RememberPaths()
	defer restorePaths()
	CredentialsFile = path.Join("/path/that/not/exists.json")

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headerContent := r.Header.Get("Authorization")
		require.Empty(t, headerContent)
	}))
	defer ts.Close()

	client, err := NewHTTPClient(true)
	require.NoError(t, err)
	require.NotNil(t, client.credentials)

	res, err := client.Call(ts.URL, bytes.NewBuffer([]byte{}))
	require.NoError(t, err)
	defer res.Body.Close()
}

// Test that missing body in request is accepted.
func TestCallWithMissingBody(t *testing.T) {
	restorePaths := RememberPaths()
	defer restorePaths()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.EqualValues(t, http.NoBody, r.Body)
	}))
	defer ts.Close()

	client, err := NewHTTPClient(false)
	require.NoError(t, err)
	res, err := client.Call(ts.URL, nil)
	require.NoError(t, err)
	defer res.Body.Close()
}

// Test that the authentication credentials are detected properly.
func TestHasAuthenticationCredentials(t *testing.T) {
	// Arrange
	restorePaths := RememberPaths()
	defer restorePaths()

	tmpDir, _ := os.MkdirTemp("", "reg")
	defer os.RemoveAll(tmpDir)

	CredentialsFile = path.Join(tmpDir, "credentials.json")

	content := `{
		"basic_auth": [
			{
				"ip": "10.0.0.1",
				"port": 42,
				"user": "foo",
				"password": "bar"
			}
		]
	}`

	_ = os.WriteFile(CredentialsFile, []byte(content), 0o600)

	// Act
	client, err := NewHTTPClient(false)

	// Assert
	require.NoError(t, err)
	require.True(t, client.HasAuthenticationCredentials())
}

// Test that the authentication credentials are not detected if the credentials
// file exists but it's empty.
func TestHasAuthenticationCredentialsEmptyFile(t *testing.T) {
	// Arrange
	restorePaths := RememberPaths()
	defer restorePaths()

	tmpDir, _ := os.MkdirTemp("", "reg")
	defer os.RemoveAll(tmpDir)

	CredentialsFile = path.Join(tmpDir, "credentials.json")

	content := `{ "basic_auth": [ ] }`

	_ = os.WriteFile(CredentialsFile, []byte(content), 0o600)

	// Act
	client, err := NewHTTPClient(false)

	// Assert
	require.NoError(t, err)
	require.False(t, client.HasAuthenticationCredentials())
}

// Test that the authentication credentials are not detected if the credentials
// is missing.
func TestHasAuthenticationCredentialsMissingFile(t *testing.T) {
	// Arrange
	restorePaths := RememberPaths()
	defer restorePaths()

	CredentialsFile = "/not/exist/file.json"

	// Act
	client, err := NewHTTPClient(false)

	// Assert
	require.NoError(t, err)
	require.False(t, client.HasAuthenticationCredentials())
}
