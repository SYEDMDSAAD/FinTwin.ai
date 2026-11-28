import org.flywaydb.core.Flyway;
import java.nio.file.*;
import java.util.*;

/**
 * Applies the backend's Flyway migrations to the database in backend/.env.
 * Prints versions only, never connection settings.
 * Args: <path to .env> <migrations dir> [--apply]
 */
public class Migrate {
    public static void main(String[] a) throws Exception {
        Map<String, String> env = new HashMap<>();
        for (String line : Files.readAllLines(Path.of(a[0]))) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#") || !line.contains("=")) continue;
            int i = line.indexOf('=');
            String v = line.substring(i + 1).trim();
            if (v.length() > 1 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))))
                v = v.substring(1, v.length() - 1);
            env.put(line.substring(0, i).trim(), v);
        }
        Flyway f = Flyway.configure()
                .dataSource(env.getOrDefault("FLYWAY_DB_URL", env.get("DB_URL")), env.get("DB_USERNAME"), env.get("DB_PASSWORD"))
                .locations("filesystem:" + a[1]).schemas("public")
                .baselineVersion("0").outOfOrder(false).load();
        var current = f.info().current();
        System.out.println("current: " + (current == null ? "none" : current.getVersion()));
        for (var m : f.info().pending()) System.out.println("pending: V" + m.getVersion() + " " + m.getDescription());
        if (a.length > 2 && a[2].equals("--apply")) {
            var r = f.migrate();
            System.out.println("applied " + r.migrationsExecuted + ", now at " + f.info().current().getVersion());
        } else {
            System.out.println("(dry run — add --apply to run the pending migrations)");
        }
    }
}
