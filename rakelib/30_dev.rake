# Development
# This file defines development-stage tasks,
# e.g., unit testing, linting, or debugging.

###############
### Files ###
###############

go_codebase = GO_SERVER_CODEBASE +
        GO_AGENT_CODEBASE +
        GO_TOOL_CODEBASE

go_dev_codebase = go_codebase + GO_MOCKS

# The temporary file generated by Storybook.
CLEAN.append "webui/documentation.json"

python_requirement_files = [
    "doc/src/requirements.in",
    "rakelib/init_deps/pytest.in",
    "rakelib/init_deps/sphinx.in",
    "rakelib/init_deps/pylinters.in",
    "tests/sim/requirements.in",
]

#############
### Tasks ###
#############

namespace :fmt do
    desc 'Make frontend source code prettier.
        SCOPE - the files that the prettier should process, relative to webui directory - default: **/*'
    task :ui => [NPX] + WEBUI_CODEBASE do
        scope = "**/*"
        if !ENV["SCOPE"].nil?
            scope = ENV["SCOPE"]
        end
        Dir.chdir('webui') do
            sh NPX, "prettier", "--config", ".prettierrc", "--write", scope
        end
    end

    desc 'Format backend source code.
        SCOPE - the files that should be formatted, relative to the backend directory - default: ./...'
    task :backend => [GO] + go_codebase do
        scope = "./..."
        if !ENV["SCOPE"].nil?
            scope = ENV["SCOPE"]
        end
        Dir.chdir('backend') do
            sh GO, "fmt", scope
        end
    end
end


namespace :unittest do
    desc 'Run unit tests for UI.
        TEST - globs of test files to include, relative to root or webui directory - default: unspecified
            There are 2 special cases:
                when a path to directory is provided, all spec files ending ".spec.@(ts|tsx)" will be included
                when a path to a file is provided, and a matching spec file exists it will be included instead
        DEBUG - run the tests in debug mode (no headless) - default: false'
    task :ui => [CHROME, NPX] + WEBUI_CODEBASE do
        debug = "false"
        if ENV["DEBUG"] == "true"
            debug = "true"
        end

        opts = []
        if !ENV["TEST"].nil?
            # The IDE built-in feature to copy a relative path returns the value
            # that starts from the repository's root. But this option requires
            # the path relative to the main frontend directory. The below line
            # allows us to provide both a path relative to the root or webui
            # directory.
            test_path = ENV["TEST"].delete_prefix('webui/')
            opts += ["--include", test_path]
        end

        opts += ["--progress", debug]
        opts += ["--watch", debug]

        opts += ["--browsers"]
        if debug == "true"
            opts += ["Chrome"]
        else
            opts += ["ChromeNoSandboxHeadless"]
        end

        Dir.chdir('webui') do
            sh NPX, "ng", "test", *opts
        end
    end

    desc 'Run backend unit and coverage tests
        SCOPE - Scope of the tests - default: all files
        TEST - Test name pattern to run - default: empty
        BENCHMARK - Execute benchmarks - default: false
        SHORT - Run short test routine - default: false
        HEADLESS - Run in headless mode - default: false
        VERBOSE - Print results for successful cases - default: false
        See "db:migrate" task for the database-related parameters
    '
    task :backend => [RICHGO, "db:remove_remaining", "db:migrate"] + go_dev_codebase do
        scope = ENV["SCOPE"] || "./..."
        benchmark = ENV["BENCHMARK"] || "false"
        short = ENV["SHORT"] || "false"
        verbose = ENV["VERBOSE"] || "false"

        opts = []

        if !ENV["TEST"].nil?
            opts += ["-run", ENV["TEST"]]
        end

        if benchmark == "true"
            opts += ["-bench=."]
        end

        if short == "true"
            opts += ["-short"]
        end

        if verbose == "true"
            opts += ["-v"]
        end

        with_cov_tests = scope == "./..." && ENV["TEST"].nil?

        if with_cov_tests
            opts += ["-coverprofile=coverage.out"]

            at_exit {
                sh "rm -f backend/coverage.out"
            }
        end

        Dir.chdir('backend') do
            sh RICHGO, "test", *opts, "-race", scope

            if with_cov_tests
                out = `"#{GO}" tool cover -func=coverage.out`

                puts out, ''

                problem = false
                out.each_line do |line|
                    if line.start_with? 'total:'
                        next
                    end

                    items = line.gsub(/\s+/m, ' ').strip.split(" ")
                    file = items[0]
                    func = items[1]
                    cov = items[2].strip()[0..-2].to_f
                    rel_path = file.gsub("isc.org/stork/", "backend/")

                    # Skips the mock files.
                    if GO_MOCKS.any? { |m| rel_path.include? m }
                        next
                    end

                    ignore_list = ['DetectServices', 'RestartKea', 'Serve', 'BeforeQuery', 'AfterQuery',
                                'Identity', 'LogoutHandler', 'NewDatabaseSettings', 'ConnectionParams',
                                'Password', 'loggingMiddleware', 'GlobalMiddleware', 'Authorizer',
                                'Listen', 'Shutdown', 'SetupLogging', 'UTCNow', 'detectApps',
                                'prepareTLS', 'handleRequest', 'pullerLoop', 'Collect',
                                'collectTime', 'collectResolverStat', 'collectResolverLabelStat',

                                # The Output method of the "systemCommandExecutor" structure encapsulates the
                                # "exec.Command" call to allow mocking of the system response in unit tests. The
                                # "exec.Command" cannot be directly mocked, so it is impossible to test the "Output"
                                # method.
                                'Output',

                                # We spent a lot of time to try test the main agent function. It is a problematic
                                # function because it starts listening and blocks itself until receiving SIGINT.
                                # Unfortunately, the signal handler isn't registered immediately after the function
                                # begins but after a short period.
                                # The unit tests for it were very unstable and time-depends. Additionally, the value
                                # of these tests was relatively poor. This function shouldn't be executed by the unit
                                # tests but rather by system tests.
                                'runAgent',

                                # this function requires interaction with user so it is hard to test
                                'getAgentAddrAndPortFromUser',

                                # this requires interacting with terminal
                                'GetSecretInTerminal', 'IsRunningInTerminal',

                                # Testing coverage should ignore testutil because we don't require writing
                                # tests for testing code. They can still be written but we shouldn't fail
                                # if they are not.
                                'isc.org/stork/testutil',
                                ]
                    if short == 'true'
                        ignore_list.concat(['setupRootKeyAndCert', 'setupServerKeyAndCert', 'SetupServerCerts',
                                        'ExportSecret'])
                    end

                    if cov < 35 and not ignore_list.include? func
                        # Check if the file the whole package is ignored.
                        should_ignore = false
                        ignore_list.each { |ignored|
                            if file.start_with? ignored
                                should_ignore = true
                                break
                            end
                        }
                        if not should_ignore
                            puts "FAIL: %-80s %5s%% < 35%%" % ["#{rel_path} #{func}", "#{cov}"]
                            problem = true
                        end
                    end
                end

                if problem
                    fail("\nFAIL: Tests coverage is too low, add some tests\n\n")
                end
            end
        end
    end

    desc 'Run backend unit tests (debug mode)
        SCOPE - Scope of the tests - required
        HEADLESS - Run in headless mode - default: false
        See "db:migrate" task for the database-related parameters'
    task :backend_debug => [DLV, "db:remove_remaining", "db:migrate"] + go_dev_codebase do
        if ENV["SCOPE"].nil?
            fail "Scope argument is required"
        end

        opts = []

        if ENV["HEADLESS"] == "true"
            opts = ["--headless", "-l", "0.0.0.0:45678"]
        end

        Dir.chdir('backend') do
            sh DLV, *opts, "test", ENV["SCOPE"]
        end
    end

    desc 'Show backend coverage of unit tests in web browser
        See "db:migrate" task for the database-related parameters'
    task :backend_cov => [GO, "unittest:backend"] do
        if !ENV["SCOPE"].nil?
            fail "Environment variable SCOPE cannot be specified"
        end

        if !ENV["TEST"].nil?
            fail "Environment variable TEST cannot be specified"
        end

        puts "Warning: Coverage may not work under Chrome-like browsers; use Firefox if any problems occur."
        Dir.chdir('backend') do
            sh GO, "tool", "cover", "-html=coverage.out"
        end
    end
end


namespace :build do
    desc 'Builds Stork documentation continuously whenever source files change'
    task :doc_live => [ENTR] + DOC_USER_CODEBASE + DOC_DEV_CODEBASE do
        Open3.pipeline(
            ['printf', '%s\\n', *DOC_USER_CODEBASE, *DOC_DEV_CODEBASE],
            [ENTR, '-d', 'rake', 'build:doc']
        )
    end

    desc 'Build Stork backend continuously whenever source files change'
    task :backend_live => go_codebase do
        Open3.pipeline(
            ['printf', '%s\\n', *go_codebase],
            [ENTR, '-d', 'rake', 'build:backend']
        )
    end

    desc 'Build Stork UI (testing mode)'
    task :ui_debug => [WEBUI_DEBUG_DIRECTORY]


    desc 'Build Stork UI (testing mode) continuously whenever source files change'
    task :ui_live => [NPX] + WEBUI_CODEBASE do
        Dir.chdir('webui') do
            sh NPX, "ng", "build", "--watch"
        end
    end
end


namespace :run do
    desc 'Run simulator'
    task :sim => [FLASK] do
        ENV["STORK_SERVER_URL"] = "http://localhost:8080"
        ENV["FLASK_ENV"] = "development"
        ENV["FLASK_APP"] = "sim.py"
        ENV["LC_ALL"]  = "C.UTF-8"
        ENV["LANG"] = "C.UTF-8"

        Dir.chdir('tests/sim') do
            sh FLASK, "run", "--host", "0.0.0.0", "--port", "5005"
        end
    end

    desc "Run Stork Server (debug mode, no doc and UI)
        HEADLESS - run debugger in headless mode - default: false
        UI_MODE - WebUI mode to use, must be build separately - choose: 'production', 'testing', 'none' or unspecify
        DB_TRACE - trace SQL queries - default: false"
    task :server_debug => [DLV, "db:setup_envvars", :pre_run_server] + GO_SERVER_CODEBASE do
        opts = []
        debug_opts = []
        if ENV["HEADLESS"] == "true"
            opts = ["--headless", "-l", "0.0.0.0:45678"]
            debug_opts.append "--continue"
        end

        Dir.chdir("backend/cmd/stork-server") do
            sh DLV, *opts, "debug",
                "--accept-multiclient",
                "--log",
                "--api-version", "2",
                *debug_opts
        end
    end

    desc 'Run Stork Agent (debug mode)
        HEADLESS - run debugger in headless mode - default: false'
    task :agent_debug => [DLV] + GO_AGENT_CODEBASE do
        opts = []

        if ENV["HEADLESS"] == "true"
            opts = ["--headless", "-l", "0.0.0.0:45678"]
        end

        Dir.chdir("backend/cmd/stork-agent") do
            sh DLV, *opts, "debug"
        end
    end

    desc 'Open the documentation in the browser'
    task :doc => [DOC_USER_ROOT, DOC_DEV_ROOT] do
        program = nil
        if OS == "macos"
            program = "open"
        elsif OS == "linux" || OS == "FreeBSD"
            program = "xdg-open"
        else
            fail "operating system (#{OS}) not supported"
        end

        system program, "#{DOC_USER_ROOT}/index.html"
        system program, "#{DOC_DEV_ROOT}/index.html"
    end
end


namespace :lint do
    desc "Run danger commit linter"
    task :git => [DANGER] do
        if ENV["CI"] != "true"
            puts "Warning! You cannot run this command locally."
        end
        sh DANGER, "--fail-on-errors=true", "--new-comment"
    end

    desc 'Check frontend source code'
    task :ui => [NPX] + WEBUI_CODEBASE do
        Dir.chdir('webui') do
            sh NPX, "ng", "lint"
            sh NPX, "prettier", "--config", ".prettierrc", "--check", "**/*"
        end
    end

    desc 'Check backend source code
        FIX - fix linting issues - default: false'
    task :backend => [GOLANGCILINT] + go_dev_codebase do
        opts = []
        if ENV["FIX"] == "true"
            opts += ["--fix"]
        end

        Dir.chdir("backend") do
            sh GOLANGCILINT, "run", *opts
        end
    end

    desc 'Check shell scripts
        FIX - fix linting issues - default: false'
    task :shell => [GIT, SHELLCHECK] do
        # Get all files committed to git that have shell-specific terminations.
        files = []
        Open3.pipeline_r(
            [GIT, "ls-files"],
            ["grep", "-E", "\.sh$|\.prerm$|\.postinst"],
        ) {|output|
          output.each_line {|line|
            files.append line.rstrip
          }
        }

        # Add other files that are missing terminatons or ar more difficult to match.
        files.append 'utils/git-hooks/prepare-commit-msg'
        files.append 'utils/git-hooks-install'

        # Do the checking or fixing.
        if ENV["FIX"] == "true"
            Open3.pipeline(
                [SHELLCHECK, "-f", "diff", *files],
                [GIT, "apply", "--allow-empty"],
            )
        else
            sh SHELLCHECK, *files
        end
    end

    desc 'Runs pylint and flake8, python linter tools'
    task :python => ['lint:python:pylint', 'lint:python:flake8']

    namespace :python do
        desc 'Runs pylint, python linter tool'
        task :pylint => [PYLINT] do
            python_files, exit_code = Open3.capture2('git', 'ls-files', '*.py')
            python_files = python_files.split("\n").map{ |string| string.strip }
            puts "Running pylint:"
            sh PYLINT, '--rcfile', '.pylint', *python_files
        end

        desc 'Runs flake8, python linter tool'
        task :flake8 => [FLAKE8] do
            python_files, exit_code = Open3.capture2('git', 'ls-files', '*.py')
            python_files = python_files.split("\n").map{ |string| string.strip }
            puts "Running flake8:"
            sh FLAKE8, '--config', '.flake8', '--color=auto', *python_files
        end
    end
end


namespace :audit do
    desc 'Check the UI security issues.
        FIX - fix the detected vulnerabilities - default: false
        FORCE - allow for breaking changes - default: false'
    task :ui => [NPM] do
        opts = []
        if ENV["FIX"] == "true"
            opts.append "fix"
            if ENV["FORCE"] == "true"
                opts.append "--force"
            end
        end

        Dir.chdir("webui") do
            sh NPM, "audit", *opts
        end
    end

    desc 'Check the backend security issues'
    task :backend => [GOVULNCHECK] + go_codebase do
        Dir.chdir("backend") do
            sh GOVULNCHECK, "-v", "./..."
        end
    end

    desc 'Check the backend security issues (including testing codebase)'
    task :backend_tests => [GOVULNCHECK] + go_dev_codebase do
        Dir.chdir("backend") do
            sh GOVULNCHECK, "-v", "-test", "./..."
        end
    end
end


namespace :db do
    desc 'Setup the database environment variables
        DB_NAME - database name - default: env:POSTGRES_DB or storktest
        DB_HOST - database host - default: env:POSTGRES_ADDR or empty
        DB_PORT - database port - default: 5432
        DB_USER - database user - default: env:POSTGRES_USER or storktest
        DB_PASSWORD - database password - default: env: POSTGRES_PASSWORD or storktest
        DB_TRACE - trace SQL queries - default: false
        DB_MAINTENANCE_NAME - maintanance database name - default: postgres
        DB_MAINTENANCE_USER - maintannce username - default: postgres
        DB_MAINTENANCE_PASSWORD - maintenance password - default: empty'
    task :setup_envvars do
        dbname = ENV["STORK_DATABASE_NAME"] || ENV["DB_NAME"] || ENV["POSTGRES_DB"] || "storktest"
        dbhost = ENV["STORK_DATABASE_HOST"] || ENV["DB_HOST"] || ENV["POSTGRES_ADDR"] || ""
        dbport = ENV["STORK_DATABASE_PORT"] || ENV["DB_PORT"] || "5432"
        dbuser = ENV["STORK_DATABASE_USER_NAME"] || ENV["DB_USER"] || ENV["POSTGRES_USER"] || "storktest"
        dbpass = ENV["STORK_DATABASE_PASSWORD"] || ENV["DB_PASSWORD"] || ENV["POSTGRES_PASSWORD"] || "storktest"
        dbtrace = ENV["DB_TRACE"] || "false"
        dbmaintenance = ENV["STORK_DATABASE_MAINTENANCE_NAME"] || ENV["DB_MAINTENANCE_NAME"] || "postgres"
        dbmaintenanceuser = ENV["STORK_DATABASE_MAINTENANCE_USER_NAME"] || ENV["DB_MAINTENANCE_USER"] || "postgres"
        dbmaintenancepassword = ENV["STORK_DATABASE_MAINTENANCE_PASSWORD"] || ENV["DB_MAINTENANCE_PASSWORD"]

        if dbhost.include? ':'
            dbhost, dbport = dbhost.split(':')
        end

        ENV["STORK_DATABASE_HOST"] = dbhost
        ENV["STORK_DATABASE_PORT"] = dbport
        ENV["STORK_DATABASE_USER_NAME"] = dbuser
        ENV["STORK_DATABASE_PASSWORD"] = dbpass
        ENV["STORK_DATABASE_NAME"] = dbname
        ENV["STORK_DATABASE_MAINTENANCE_NAME"] = dbmaintenance
        ENV["STORK_DATABASE_MAINTENANCE_USER_NAME"] = dbmaintenanceuser
        ENV["STORK_DATABASE_MAINTENANCE_PASSWORD"] = dbmaintenancepassword

        if ENV["STORK_DATABASE_TRACE"].nil? && dbtrace == "true"
            ENV["STORK_DATABASE_TRACE"] = "run"
        end

        ENV['PGPASSWORD'] = dbpass
    end

    desc 'Migrate (and create) database to the newest version
        FORCE_MIGRATION - reset database to the initial state and perform all migration again - default: false
        See db:setup_envvars task for more options.'
    task :migrate => [:setup_envvars, TOOL_BINARY_FILE] do
        sh TOOL_BINARY_FILE, "db-create"
        sh TOOL_BINARY_FILE, "db-init"
        if ENV["FORCE_MIGRATION"] == "true"
            sh TOOL_BINARY_FILE, "db-reset"
        end
        sh TOOL_BINARY_FILE, "db-up"
    end

    desc "Remove remaining test databases and users
        See db:setup_envvars task for more options."
    task :remove_remaining => [PSQL, DROPUSER, DROPDB, :setup_envvars] do
        dbhost = ENV["STORK_DATABASE_HOST"]
        dbuser = ENV["STORK_DATABASE_USER_NAME"]
        dbport = ENV["STORK_DATABASE_PORT"]
        dbname = ENV["STORK_DATABASE_NAME"]
        dbmaintenancename = ENV["STORK_DATABASE_MAINTENANCE_NAME"]
        dbmaintenanceuser = ENV["STORK_DATABASE_MAINTENANCE_USER_NAME"]
        dbmaintenancepass = ENV["STORK_DATABASE_MAINTENANCE_PASSWORD"]

        ENV["PGPASSWORD"] = dbmaintenancepass

        psql_access_opts = [
            "-h", dbhost,
            "-p", dbport,
            "-U", dbmaintenanceuser
        ]

        psql_select_opts = [
            "-t",
            "-q",
            "-X",
        ]

        # Don't destroy the pattern database
        dbname_pattern = "#{dbname}.+"

        Open3.pipeline([
            PSQL, *psql_select_opts, *psql_access_opts, dbmaintenancename,
            "-c", "SELECT datname FROM pg_database WHERE datname ~ '#{dbname_pattern}'"
        ], [
            # Remove empty rows
            "awk", "NF"
        ], [
            "xargs", "-P", "16", "-n", "1", "-r", DROPDB, *psql_access_opts
        ])

        Open3.pipeline([
            PSQL, *psql_select_opts, *psql_access_opts, dbmaintenancename,
            "-c", "SELECT usename FROM pg_user WHERE usename ~ '#{dbuser}.+'"
        ], [
            # Remove empty rows
            "awk", "NF"
        ], [
            "xargs", "-P", "16", "-n", "1", "-r", DROPUSER, *psql_access_opts
        ])
    end
end


desc 'Run Storybook
    CACHE - use internal Storybook cache, disable for fix the "Cannot GET /" problem - default: true'
task :storybook => [NPM] + WEBUI_CODEBASE do
    opts = []
    if ENV["CACHE"] == "false"
        opts.append "--no-manager-cache"
    end

    Dir.chdir("webui") do
        sh NPM, "run", "storybook", "--", *opts
    end
end


namespace :gen do
    namespace :ui do
        desc 'Generate Angular stuff. Pass through the arguments to
        "ng generate" command. They must be delimited by double dash (--).'
        task :angular => [NPX] do |t|
            flags = []
            found_delimiter = false

            ARGV.each do |arg|
                if arg == "--"
                    found_delimiter = true
                    next
                end

                next if !found_delimiter

                flags.append arg
            end

            if flags.empty?
                fail "No double dash (--) delimiter found."
            end

            Dir.chdir("webui") do
                sh NPX, "ng", "generate", *flags
            end
        end

        desc 'Generate Angular service
        NAME - name of the service - required'
        task :service => [NPX] do
            Dir.chdir("webui") do
                sh NPX, "ng", "generate", "service", ENV["NAME"]
            end
        end

        desc 'Regenerate package.json.lock'
        task :package_lock => [NPM] do
            Dir.chdir("webui") do
                sh NPM, "install", "--package-lock-only"
            end
        end
    end

    namespace :backend do
        desc 'Regenerate go.sum.'
        task :go_sum => [GO] do
            Dir.chdir("backend") do
                sh GO, "mod", "download", "-x"
            end
        end
    end

    desc 'Regenerate Python requirements file'
    task :python_requirements => [PIP_COMPILE] do
        python_requirement_files.each do |r|
            sh PIP_COMPILE, "--resolver", "backtracking", r
        end
    end

    desc 'Regenerate Ruby lock file'
    task :ruby_gemlocks => [BUNDLE] do
        gemfiles = FileList["rakelib/init_deps/*/Gemfile"]
            .exclude(FileList["rakelib/init_deps/*/Gemfile.lock"])

        gemfiles.each do |g|
            gemfile_dir = File.dirname(g)
            Dir.chdir(gemfile_dir) do
                sh BUNDLE, "lock"
            end
        end
    end
end


namespace :update do
    desc 'Update Angular
    VERSION - target Angular version - required
    FORCE - ignore warnings - optional, default: false'
    task :angular => [NPX] do
        version=ENV["VERSION"]
        if version.nil?
            fail "Provide VERSION variable"
        end

        opts = []
        if ENV["FORCE"] == "true"
            opts.append "--force"
        end

        Dir.chdir("webui") do
            sh NPX, "ng", "update", *opts,
                "@angular/core@#{version}",
                "@angular/cli@#{version}"
        end
    end

    desc 'Update Storybook to the latest version'
    task :storybook => [STORYBOOK] do
        Dir.chdir("webui") do
            sh STORYBOOK, "--disable-telemetry", "upgrade"
        end
    end

    desc 'Update internal browsers list. It makes changes in the package-lock file to fix the problems with out-of-date data.'
    task :browserslist => [NPX] do
        Dir.chdir("webui") do
            sh NPX, "browserslist", "--update-db"
        end
    end

    desc 'Update all npm dependencies to the "Wanted" versions (mainly updates to the latest minor).'
    task :ui_deps => [NPM] do
        Dir.chdir("webui") do
            sh NPM, "update"
            # Prints possible manual updates.
            sh NPM, "outdated"
        end
    end

    desc 'Update all go.mod dependencies the latest versions'
    task :backend_deps => [GO] do
        Dir.chdir("backend") do
            sh GO, "get", "-u", "./..."
            sh GO, "mod", "tidy"
        end
    end

    desc 'Update all Python dependencies'
    task :python_requirements => [PIP_COMPILE] do
        python_requirement_files.each do |r|
            sh PIP_COMPILE, "--resolver", "backtracking", "--upgrade", r
        end
    end

    desc 'Update all Ruby dependencies'
    task :ruby_gemfiles => [BUNDLE] do
        gemfiles = FileList["rakelib/init_deps/*/Gemfile"]
            .exclude(FileList["rakelib/init_deps/*/Gemfile.lock"])
        # List all Gemfiles.
        gemfiles.each do |g|
            gemfile_dir = File.dirname(g)
            Dir.chdir(gemfile_dir) do
                # Update dependencies in the lock file.
                sh BUNDLE, "update"
            end
        end
    end
end


namespace :prepare do
    desc 'Install the external dependencies related to the development'
    task :dev do
        find_and_prepare_deps(__FILE__)
    end
end


namespace :check do
    desc 'Check the external dependencies related to the development'
    task :dev do
        check_deps(__FILE__)
    end
end
