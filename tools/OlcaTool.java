import java.io.File;

import org.openlca.core.database.Derby;
import org.openlca.core.io.ImportLog;
import org.openlca.ilcd.io.DataStore;
import org.openlca.ilcd.io.FileStore;
import org.openlca.ilcd.io.ZipStore;
import org.openlca.io.ilcd.input.Import;

/**
 * Headless database helpers, so no GUI clicks are needed.
 *
 *   restore    <file.zolca>        <db name>   unzip an openLCA backup
 *   import-ilcd <ilcd.zip|folder>  <db name>   import an ILCD package
 *   counts      <db name>                      print record counts
 *
 * Databases live in <data>/databases/<db name>, data dir from -Ddata=...
 * (default: ./olca-data). Run through ./olca.sh, not directly.
 * The database must not be open in the GUI or the IPC server at the same time.
 */
public class OlcaTool {

  public static void main(String[] args) throws Exception {
    if (args.length < 2) {
      System.err.println("usage: restore <zolca> <db> | import-ilcd <zip|dir> <db> | counts <db>");
      System.exit(1);
    }
    var dbs = new File(System.getProperty("data", "olca-data"), "databases");
    dbs.mkdirs();
    switch (args[0]) {
      case "restore" -> {
        requireFile(args[1]);
        var target = new File(dbs, args[2]);
        if (target.exists())
          fail("database folder already exists: " + target);
        Derby.unzip(target, new File(args[1]));  // (target folder, zolca file)
        // opening the database runs any needed schema upgrade
        try (var db = new Derby(target)) {
          System.out.println("restored " + db.getName() + ", schema version " + db.getVersion());
        }
      }
      case "import-ilcd" -> {
        requireFile(args[1]);
        var src = new File(args[1]);
        DataStore store = src.isDirectory() ? new FileStore(src) : new ZipStore(src);
        try (var db = new Derby(new File(dbs, args[2])); store) {
          var imp = Import.of(store, db).withAllFlows(true);
          imp.log().listen(m -> {
            if (m.state() == ImportLog.State.ERROR || m.state() == ImportLog.State.WARNING)
              System.out.println(m.state() + ": " + m.message());
          });
          long t0 = System.currentTimeMillis();
          imp.run();
          System.out.printf("import finished in %.0f s: %d imported, %d errors, %d warnings%n",
              (System.currentTimeMillis() - t0) / 1000.0,
              imp.log().countOf(ImportLog.State.IMPORTED),
              imp.log().countOf(ImportLog.State.ERROR),
              imp.log().countOf(ImportLog.State.WARNING));
        }
      }
      case "counts" -> {
        var dir = new File(dbs, args[1]);
        if (!dir.isDirectory())
          fail("no database " + args[1] + " in " + dbs);
        try (var db = new Derby(dir);
             var con = db.createConnection(); var st = con.createStatement()) {
          for (var t : new String[]{"tbl_processes", "tbl_flows", "tbl_impact_methods",
              "tbl_impact_categories", "tbl_sources", "tbl_locations", "tbl_product_systems"}) {
            var rs = st.executeQuery("select count(*) from " + t);
            rs.next();
            System.out.println(t.substring(4) + ": " + rs.getLong(1));
          }
        }
      }
      default -> fail("unknown command " + args[0]);
    }
  }

  static void requireFile(String path) {
    // ZipStore silently creates an empty zip for a wrong path, so check first
    if (!new File(path).exists())
      fail("file not found: " + path);
  }

  static void fail(String msg) {
    System.err.println(msg);
    System.exit(1);
  }
}
