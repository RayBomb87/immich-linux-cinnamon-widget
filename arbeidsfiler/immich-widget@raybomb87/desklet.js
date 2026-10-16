const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;

const FETCH_KEYS = ["server-url", "api-key", "source", "source-name", "include-screenshots", "smart-crop", "count"];
const LOOK_KEYS = ["delay", "radius", "shadow", "fade", "date-format", "place", "caption-size"];
const SIZE_KEYS = ["width", "height"];

class ImmichWidget extends Desklet.Desklet {
    constructor(metadata, id) {
        super(metadata, id);
        this._path = metadata.path;
        this._dir = GLib.build_filenamev([GLib.get_user_cache_dir(), "immich-widget", String(id)]);
        GLib.mkdir_with_parents(this._dir, 0o700);

        this.settings = new Settings.DeskletSettings(this, metadata.uuid, id);
        let bind = (key, cb) => this.settings.bind(key, key.replace(/-/g, "_"), cb);
        FETCH_KEYS.forEach(k => bind(k, () => this._scheduleFetch(2)));
        LOOK_KEYS.forEach(k => bind(k, () => this._build()));
        SIZE_KEYS.forEach(k => bind(k, () => { this._build(); this._scheduleFetch(2); }));
        bind("refresh-hours", () => this._startRefreshTimer());

        this._photos = [];
        this._captions = {};
        this._index = 0;
        this._slideTimer = 0;
        this._refreshTimer = 0;
        this._fetchTimer = 0;
        this._scanTimer = 0;
        this._fetching = false;
        this._message = "";

        this._monitor = Gio.File.new_for_path(this._dir).monitor_directory(0, null);
        this._monitorId = this._monitor.connect("changed", () => this._scheduleScan());

        this._build();
        this._startRefreshTimer();
        // fetch shortly after login so the network is up; cached photos show meanwhile
        this._scheduleFetch(this._hasPhotos() ? 60 : 3);
    }

    // ---- layout -------------------------------------------------------------

    _build() {
        this._stopSlides();
        let size = `width: ${this.width}px; height: ${this.height}px; border-radius: ${this.radius}px;`;
        this._box = new St.Widget({
            style_class: "immich-widget" + (this.shadow ? " immich-widget-shadow" : ""),
            style: size, layout_manager: new Clutter.BinLayout(), reactive: true });
        this._layers = [0, 1].map(() => {
            let w = new St.Widget({ style: size, opacity: 0 });
            this._box.add_child(w);
            return w;
        });
        this._active = 0;
        this._caption = new St.Label({
            style_class: "immich-widget-caption", style: `font-size: ${this.caption_size}pt;`,
            x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.END, x_expand: true, y_expand: true });
        this._box.add_child(this._caption);
        this._messageLabel = new St.Label({
            style_class: "immich-widget-message",
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true });
        this._messageLabel.clutter_text.line_wrap = true;
        this._box.add_child(this._messageLabel);
        this.setContent(this._box);
        this._scan();
    }

    _showMessage() {
        let text = "";
        if (!this._photos.length) {
            if (!this.server_url.trim() || !this.api_key.trim())
                text = "Right-click → Configure\nto connect to your Immich server";
            else
                text = this._fetching ? "Fetching photos…" : (this._message || "No photos yet");
        }
        this._messageLabel.text = text;
        this._messageLabel.visible = text != "";
    }

    // ---- slideshow ----------------------------------------------------------

    _hasPhotos() {
        return GLib.file_test(GLib.build_filenamev([this._dir, "captions.json"]), GLib.FileTest.EXISTS);
    }

    _scheduleScan() {
        if (this._scanTimer) return;
        this._scanTimer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 2, () => {
            this._scanTimer = 0;
            this._scan();
            return GLib.SOURCE_REMOVE;
        });
    }

    _scan() {
        let photos = [];
        try {
            let e = Gio.File.new_for_path(this._dir).enumerate_children("standard::name", 0, null);
            let info;
            while ((info = e.next_file(null))) {
                let n = info.get_name();
                if (n.endsWith(".jpg")) photos.push(n);
            }
            e.close(null);
        } catch (err) { }
        try {
            let [, data] = GLib.file_get_contents(GLib.build_filenamev([this._dir, "captions.json"]));
            this._captions = JSON.parse(new TextDecoder().decode(data));
        } catch (err) {
            this._captions = {};
        }
        for (let i = photos.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [photos[i], photos[j]] = [photos[j], photos[i]];
        }
        this._photos = photos;
        this._index = 0;
        this._showMessage();
        this._stopSlides();
        if (!photos.length) return;
        this._next();
        this._slideTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.delay, () => {
            this._next();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _next() {
        if (!this._photos.length) return;
        let name = this._photos[this._index++ % this._photos.length];
        this._current = name;
        let uri = Gio.File.new_for_path(GLib.build_filenamev([this._dir, name])).get_uri();
        let incoming = this._layers[1 - this._active], outgoing = this._layers[this._active];
        incoming.style = `width: ${this.width}px; height: ${this.height}px; border-radius: ${this.radius}px;` +
            ` background-image: url("${uri}"); background-size: cover;`;
        this._box.set_child_above_sibling(incoming, outgoing);
        this._box.set_child_above_sibling(this._caption, null);
        this._box.set_child_above_sibling(this._messageLabel, null);
        let mode = Clutter.AnimationMode.EASE_IN_OUT_QUAD;
        incoming.ease({ opacity: 255, duration: this.fade, mode });
        outgoing.ease({ opacity: 0, duration: this.fade, mode });
        this._active = 1 - this._active;
        this._caption.text = this._captionFor(this._captions[name] || {});
    }

    _captionFor(c) {
        let parts = [];
        if (this.date_format && /^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) {
            let [y, m, d] = c.date.split("-").map(Number);
            let dt = GLib.DateTime.new_local(y, m, d, 12, 0, 0);
            if (dt) parts.push(dt.format(this.date_format));
        }
        if (this.place && c.city)
            parts.push(this.place == "city-country" && c.country ? `${c.city}, ${c.country}` : c.city);
        return parts.join(" · ");
    }

    _stopSlides() {
        if (this._slideTimer) {
            GLib.source_remove(this._slideTimer);
            this._slideTimer = 0;
        }
    }

    // ---- fetching -----------------------------------------------------------

    _startRefreshTimer() {
        if (this._refreshTimer) GLib.source_remove(this._refreshTimer);
        this._refreshTimer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, this.refresh_hours * 3600, () => {
            this._fetch();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _scheduleFetch(seconds) {
        if (this._fetchTimer) GLib.source_remove(this._fetchTimer);
        this._fetchTimer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, seconds, () => {
            this._fetchTimer = 0;
            this._fetch();
            return GLib.SOURCE_REMOVE;
        });
    }

    on_fetch_now() {
        this._fetch();
    }

    _fetch() {
        if (this._fetching || !this.server_url.trim() || !this.api_key.trim()) {
            this._showMessage();
            return;
        }
        let argv = ["python3", GLib.build_filenamev([this._path, "fetch.py"]),
            "--server", this.server_url, "--out", this._dir,
            "--count", String(this.count), "--width", String(this.width), "--height", String(this.height),
            "--source", this.source, "--name", this.source_name];
        if (this.include_screenshots) argv.push("--include-screenshots");
        if (!this.smart_crop) argv.push("--no-faces");
        try {
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE });
            launcher.setenv("IMMICH_API_KEY", this.api_key.trim(), true);
            let proc = launcher.spawnv(argv);
            this._fetching = true;
            this._showMessage();
            proc.communicate_utf8_async(null, null, (p, res) => {
                this._fetching = false;
                try {
                    let [, , stderr] = p.communicate_utf8_finish(res);
                    this._message = p.get_successful() ? "" : (stderr || "").trim().split("\n").pop();
                    if (this._message) global.logWarning(`Immich Widget: ${this._message}`);
                } catch (e) {
                    this._message = String(e);
                }
                this._scan();
            });
        } catch (e) {
            this._fetching = false;
            this._message = String(e);
            this._showMessage();
        }
    }

    // ---- events -------------------------------------------------------------

    on_desklet_clicked(event) {
        if (event.get_button() == 1) {
            this._next();
        } else if (event.get_button() == 2 && this._current) {
            let server = this.server_url.trim().replace(/\/+$/, "");
            if (!/^https?:\/\//.test(server)) server = "http://" + server;
            Util.spawn(["xdg-open", `${server}/photos/${this._current.replace(/\.jpg$/, "")}`]);
        }
    }

    on_desklet_removed() {
        this._stopSlides();
        for (let t of [this._refreshTimer, this._fetchTimer, this._scanTimer])
            if (t) GLib.source_remove(t);
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
    }
}

function main(metadata, id) {
    return new ImmichWidget(metadata, id);
}
