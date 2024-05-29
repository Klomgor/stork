package dbmigs

import "github.com/go-pg/migrations/v8"

// The migration deletes the unused interval from the settings table. The
// interval was used for the Prometheus metrics puller which has been removed.
// It seems to be safe to keep the interval in the settings table as it is not
// used anywhere else. But we are afraid that it may start be problematic in
// the future if we refactor the setting table handling. It may produce some
// hard to find bugs affecting only the long term running systems.
func init() {
	migrations.MustRegisterTx(func(db migrations.DB) error {
		_, err := db.Exec(`
			DELETE FROM setting WHERE name = 'metrics_collector_interval';
		`)
		return err
	}, func(db migrations.DB) error {
		_, err := db.Exec(`
			INSERT INTO setting (name, val_type, value) VALUES ('metrics_collector_interval', 1, '10');
		`)
		return err
	})
}
