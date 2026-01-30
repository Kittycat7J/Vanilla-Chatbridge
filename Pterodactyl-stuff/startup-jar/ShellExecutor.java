import java.io.File;
import java.net.URISyntaxException;

public class ShellExecutor {

    public static void main(String[] args) {
        try {
            File jarFile = new File(
                    ShellExecutor.class
                            .getProtectionDomain()
                            .getCodeSource()
                            .getLocation()
                            .toURI()
            );

            File dir = jarFile.getParentFile();
            File script = new File(dir, "startup.sh");

            if (!script.exists()) {
                System.err.println("startup.sh not found in " + dir.getAbsolutePath());
                System.exit(1);
            }

            System.out.println(">>> Launching startup.sh");

            ProcessBuilder pb = new ProcessBuilder(
                    "/bin/bash",
                    script.getAbsolutePath()
            );

            pb.directory(dir);
            pb.inheritIO(); // full console passthrough

            Process process = pb.start();
            process.waitFor();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
