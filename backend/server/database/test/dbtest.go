package dbtest

import(
	"log"
	"os"
	"strconv"
	"strings"
	"testing"
	"github.com/stretchr/testify/require"
	"isc.org/stork/server/database"
	"isc.org/stork/server/database/migrations"
)

// Common set of database connection options which may be converted to a string
// of space separated options used by SQL drivers.
var GenericConnOptions = dbops.DatabaseSettings{
	DbName: "storktest",
	User: "storktest",
	Password: "storktest",
	Host: "localhost",
	Port: 5432,
}

// go-pg specific database connection options.
var PgConnOptions dbops.PgOptions

var TestDB *dbops.PgDB

func init() {
	// Convert generic options to go-pg options.
	PgConnOptions = *GenericConnOptions.PgParams()

	// Check if we're running tests in Gitlab CI. If so, the host
	// running the database should be set to "postgres".
	// See https://docs.gitlab.com/ee/ci/services/postgres.html.
	if addr, ok := os.LookupEnv("POSTGRES_ADDR"); ok {
		splitAddr := strings.Split(addr, ":")
		if len(splitAddr) > 0 {
			GenericConnOptions.Host = splitAddr[0]
		}
		if len(splitAddr) > 1 {
			if p, err := strconv.Atoi(splitAddr[1]); err == nil {
				GenericConnOptions.Port = p
			}
		}
		PgConnOptions.Addr = addr
	}

	// Create an instance of the database using test credentials.
	TestDB = dbops.NewPgDB(&PgConnOptions)
	if TestDB == nil {
		log.Fatal("unable to create database instance")
	}
}

// Prepares unit test setup by re-creating the database schema and
// returns pointer to the teardown function.
func SetupDatabaseTestCase(t *testing.T) func (t *testing.T) {
	CreateSchema(t)
	return func (t *testing.T) {
		TossSchema(t)
	}
}

// Create the database schema to the latest version.
func CreateSchema(t *testing.T) {
	TossSchema(t)
	_, _, err := dbmigs.Migrate(TestDB, "init")
	require.NoError(t, err)
	_, _, err = dbmigs.Migrate(TestDB, "up")
	require.NoError(t, err)
}

// Remove the database schema.
func TossSchema(t *testing.T) {
	err := dbmigs.Toss(TestDB)
	require.NoError(t, err)
}
