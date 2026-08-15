package com.steelfrontline.launcher;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.awt.*;
import java.io.*;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 钢铁前线 Java 启动器
 * <p>
 * 职责:
 * 1. 启动一个绑定本地回环地址的 HTTP 服务器 (端口自动寻找)
 * 2. 将打包进 JAR 的游戏静态资源 (index.html, css, js) 通过 ClassLoader 提供给浏览器
 * 3. 调起系统默认浏览器进入游戏页面
 * 4. 保持服务器运行直到浏览器关闭/用户手动退出
 * <p>
 * 注: 本类使用 JDK 内置 com.sun.net.httpserver(无第三方依赖) 便于 jpackage 零依赖打包
 */
public class SteelFrontlineLauncher {

    /** 监听回环地址, 禁止外部访问 */
    private static final String BIND_ADDR = "127.0.0.1";
    /** 资源在 JAR 里的前缀 (Maven 拷贝到 classpath 根下的 game/) */
    private static final String RESOURCE_PREFIX = "/game/";

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put(".html", "text/html; charset=utf-8");
        MIME.put(".js",   "text/javascript; charset=utf-8");
        MIME.put(".mjs",  "text/javascript; charset=utf-8");
        MIME.put(".css",  "text/css; charset=utf-8");
        MIME.put(".json", "application/json; charset=utf-8");
        MIME.put(".png",  "image/png");
        MIME.put(".jpg",  "image/jpeg");
        MIME.put(".jpeg", "image/jpeg");
        MIME.put(".svg",  "image/svg+xml");
        MIME.put(".ico",  "image/x-icon");
        MIME.put(".wasm", "application/wasm");
    }

    /**
     * 程序入口:
     *   args[0] 可选 --port N 指定端口(默认自动)
     *   args[1] 可选 --headless 不自动打开浏览器(远程调试用)
     */
    public static void main(String[] args) throws Exception {
        Map<String, String> opts = parseArgs(args);
        int port = opts.containsKey("port")
                ? Integer.parseInt(opts.get("port"))
                : findFreePort();
        boolean headless = opts.containsKey("headless");

        HttpServer server = HttpServer.create(new InetSocketAddress(BIND_ADDR, port), 0);
        server.createContext("/", new GameResourceHandler());
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();

        String url = "http://" + BIND_ADDR + ":" + port + "/";
        log("==============================");
        log(" 钢铁前线 · 启动成功");
        log(" 本地地址: " + url);
        log("==============================");

        if (!headless && Desktop.isDesktopSupported()) {
            try {
                Desktop.getDesktop().browse(new URI(url));
            } catch (Exception ex) {
                log("自动打开浏览器失败, 请手动访问: " + url);
                log("原因: " + ex.getMessage());
            }
        } else if (headless) {
            log("--headless 模式: 请手动打开 " + url);
        } else {
            log("Desktop API 不可用, 请手动打开: " + url);
        }

        // 打印退出提示
        System.out.println();
        System.out.println("按 Ctrl+C 关闭.");

        // 增加 /shutdown 接口 (便于自动化关闭)
        server.createContext("/shutdown", ex -> {
            sendBytes(ex, 200, "text/plain", "ok".getBytes(StandardCharsets.UTF_8));
            ScheduledExecutorService sched = Executors.newSingleThreadScheduledExecutor();
            sched.schedule(() -> { server.stop(0); System.exit(0); }, 200, TimeUnit.MILLISECONDS);
        });

        // 判断是否有控制台交互: 有 console 且传入了 --headless 则走阻塞模式; 否则等回车或 Ctrl+C
        boolean hasConsole = (System.console() != null) && !headless;
        if (hasConsole) {
            System.out.println("按 Ctrl+C 或回车退出...");
            try {
                BufferedReader r = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
                r.readLine();
                log("正在关闭服务器...");
                server.stop(0);
                log("已退出.");
                return;
            } catch (Exception ignored) {
                // 可能没有控制台
            }
        }
        // 后台/headless/EXE 模式: 阻塞主线程直到 Ctrl+C 或外部调用 /shutdown
        final Object lock = new Object();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { synchronized (lock) { lock.notifyAll(); } }));
        synchronized (lock) { try { lock.wait(); } catch (InterruptedException ignored) {} }
    }

    // -----------------------------------------------------------
    // 静态资源处理器: 优先读 外部文件(当前目录下), 没找到则读 JAR 内资源
    // -----------------------------------------------------------
    static class GameResourceHandler implements HttpHandler {
        @Override public void handle(HttpExchange ex) throws IOException {
            String rawPath = ex.getRequestURI().getPath();
            // URL 解码 + 防路径穿越
            String decoded = java.net.URLDecoder.decode(rawPath, StandardCharsets.UTF_8);
            if (decoded.contains("..") || decoded.startsWith("\\")) {
                sendBytes(ex, 403, "text/plain", "403 Forbidden".getBytes(StandardCharsets.UTF_8));
                return;
            }
            if (decoded.equals("/")) decoded = "/index.html";

            // 1) 外部目录查找 (允许直接修改源文件调试 EXE 版本)
            Path external = Path.of(System.getProperty("user.dir"), "game", decoded.substring(1));
            if (Files.isRegularFile(external)) {
                sendBytes(ex, 200, mimeOf(decoded), Files.readAllBytes(external));
                return;
            }
            // 2) JAR classpath 资源查找
            String resPath = RESOURCE_PREFIX + decoded.substring(1);
            try (InputStream in = SteelFrontlineLauncher.class.getResourceAsStream(resPath)) {
                if (in == null) {
                    sendBytes(ex, 404, "text/plain", ("404 Not Found: " + decoded).getBytes(StandardCharsets.UTF_8));
                    return;
                }
                byte[] data = readAll(in);
                sendBytes(ex, 200, mimeOf(decoded), data);
            }
        }
    }

    // -----------------------------------------------------------
    // 辅助方法
    // -----------------------------------------------------------
    private static void sendBytes(HttpExchange ex, int code, String mime, byte[] body) throws IOException {
        Headers h = ex.getResponseHeaders();
        h.set("Content-Type", mime);
        h.set("Cache-Control", code == 200 && mime.endsWith("html")
                ? "no-cache" : "public, max-age=3600");
        h.set("X-Content-Type-Options", "nosniff");
        ex.sendResponseHeaders(code, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }

    private static String mimeOf(String path) {
        int i = path.lastIndexOf('.');
        if (i < 0) return "application/octet-stream";
        String ext = path.substring(i).toLowerCase();
        return MIME.getOrDefault(ext, "application/octet-stream");
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream(8192);
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) != -1) baos.write(buf, 0, n);
        return baos.toByteArray();
    }

    private static int findFreePort() throws IOException {
        // 在 8000-9000 之间找第一个可用端口
        for (int p = 8000; p <= 9000; p++) {
            try (ServerSocket ss = new ServerSocket()) {
                ss.bind(new InetSocketAddress(BIND_ADDR, p));
                return p;
            } catch (IOException ignored) {
                // 端口被占用, 继续
            }
        }
        throw new IOException("找不到空闲端口(8000-9000)");
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            String a = args[i];
            if (a.startsWith("--")) {
                String key = a.substring(2);
                String val = "true";
                if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                    val = args[++i];
                }
                m.put(key, val);
            }
        }
        return m;
    }

    private static void log(String s) { System.out.println(s); }
}
