/*** @type {Map<number, function(): void>} */
let server_func = new Map();

let server_func_works = [];

/*** @type {Map<string, {description: string, ping: number}>} */
let server_infos = new Map();

(async () => {
    try {
        document.refresh_servers = () => {
            document.getElementById("servers_ui").innerHTML = "";
            document["servers"].forEach((i, a) => document.getElementById("servers_ui").innerHTML = document.getElementById("servers_ui").innerHTML + `
<div class="server" onclick="document.join_server('${a}')">
    <div class="name">${i.name}</div>
    <div class="description">
        <span id="server_description_${a}">Connecting...</span>
        <span class="ping" id="server_ping_${a}">?ms</span>
    </div>
</div>
<img src="trash_can.png" onclick="document.remove_server(${a});" class="trash_can">`);
            document["servers"].forEach((i, a) => {
                const desc = document.getElementById("server_description_" + a);
                const ping = document.getElementById("server_ping_" + a);
                server_func.set(a, () => {
                    server_func_works[a] = true;
                    let pd = Date.now();
                    const xml = new XMLHttpRequest();
                    xml.open("GET", `http${i.ip !== "localhost" ? "s" : ""}://${i.ip}/api`, true);
                    xml.timeout = 2000;
                    xml.onreadystatechange = () => {
                        if (xml.readyState === xml.DONE) {
                            if (xml.responseText) {
                                let json;
                                try {
                                    json = JSON.parse(xml.responseText.toString());
                                } catch (e) {
                                }
                                if (json && document["servers"][a]) {
                                    const info = {
                                        description: json.description,
                                        ping: Date.now() - pd
                                    };
                                    server_infos.set(a, info);
                                    desc.innerHTML = info.description;
                                    ping.innerHTML = info.ping + "ms";
                                    delete server_func_works[a];
                                }
                            }
                            if (server_func.has(a))
                                setTimeout(server_func.get(a), 1000);
                        }
                    }
                    xml.send();
                });
                if (!server_func_works[a]) server_func.get(a)();
            });
        }

        document._pSet = () => {
            const max_fps = document.getElementById("max_fps");
            max_fps.value = document["settings"]["max_fps"] * 1;
            page = 3;
        }

        document.save_settings = () => {
            const max_fps = document.getElementById("max_fps");
            document["settings"]["max_fps"] = max_fps.value * 1;
            console.log(JSON.stringify({
                action: "Set-Settings",
                data: document["settings"]
            }));
            console.clear();
            page = 0;
            alert("Settings has been saved.")
        }

        document.remove_server = (a) => {
            const server = document["servers"][a];
            if (!server) return;
            let n = [];
            Object.keys(document["servers"]).forEach(i => {
                if (i * 1 !== a) {
                    n.push(document["servers"][i]);
                }
            });
            document["servers"] = n;
            console.log(JSON.stringify({
                action: "Set-Servers",
                data: document["servers"]
            }));
            console.clear();
            document.refresh_servers();
        }

        document.join_server = (a) => {
            const server = document["servers"][a];
            if (!server) return;
            run({
                ip: server.ip,
                port: server.port * 1,
                secure: server.ip !== "localhost",
                key: a
            });
            document.getElementById("ui").hidden = true;
        }

        document.ready = () => {
            document.getElementById("ui").hidden = undefined;
            document.refresh_servers();
            let max_fps = document.getElementById("max_fps");
            max_fps.value = document["settings"]["max_fps"];
        }

        document.add_server = () => {
            const name = document.getElementById("name").value;
            const ip = document.getElementById("ip").value.toLowerCase();
            const port = document.getElementById("port").value * 1 || 19132;
            if (Object.values(document["servers"]).some(i => i.ip.toString().toLowerCase() === ip && i.port * 1 === port)) {
                alert("You already added this server!");
            } else {
                document["servers"].push({
                    name: name || ip + ":" + port, ip, port
                });
                console.log(JSON.stringify({
                    action: "Set-Servers",
                    data: document["servers"]
                }));
                console.clear();
                document.refresh_servers();
            }
            page = 1;
        }

        /**
         * @param {{ip: string, port: number, secure: boolean, key: number}} config
         */
        function run(config) {
            try {
                /*** @type {HTMLCanvasElement} */
                const canvas = document.getElementById("canvas");
                canvas.classList.add("canvas");
                const scene = new Scene(canvas);
                scene.max_fps = document.getElementById("max_fps").value * 1;
                const _token = document["tokens"][config.ip + ":" + config.port];
                const text = document.getElementById("text");
                const _LOG = document.getElementById("log");
                let _rBefore = false;
                canvas.width = 1200;
                canvas.height = 700;
                let _active = false;
                let _kick_reason = null;
                let ws;
                let players = {};

                class Player extends Entity {
                    onUpdate(currentTick) {
                        if (!this.text) {
                            this.text = new Entity({
                                x: 0,
                                y: 0,
                                model: new TextModel().setText("").setColor("#000000").setFont("calibri").setPixels(16)
                            });
                            scene.addEntity(this.text, 2);
                        }
                        if (this.text.closed) this.text.closed = false;
                        const username = this["username"] || "Guest " + this["suid"];
                        this.text.model.setText(username);
                        this.text.x = this.x - username.length;
                        this.text.y -= this.model.height + 10;
                        return super.onUpdate(currentTick);
                    }

                    close() {
                        if (this.text) this.text.close();
                        return super.close();
                    }
                }

                let dots = {};

                async function update_dots(d) {
                    d = Object.values(d);
                    Object.values(dots).forEach(i=> i.close());
                    dots = {};
                    d.forEach(i=> {
                        dots[i.uuid] = new Entity({
                            x: i.x,
                            y: i.y,
                            model: new CircleModel(i.size).setColor(i.color)
                        });
                        dots[i.uuid].suid = i.uuid;
                        scene.addEntity(dots[i.uuid]);
                    })
                }

                let selfInfo = null;

                function registerPlayer({x, y, username, color, uuid}) {
                    if (players[uuid]) return players[uuid].closed = false;
                    const p = new Player({
                        x, y, model: new CircleModel(10).setColor(color)
                    });
                    p.suid = uuid;
                    p.username = username;
                    scene.addEntity(p, 1);
                    players[p.suid] = p;
                }

                function connect() {
                    if (_active) return;
                    text.innerHTML = "Connecting...";
                    const wsA = new WebSocket("ws" + (config.secure ? "s" : "") + "://" + config.ip + ":" + config.port);
                    _active = true;
                    wsA.onopen = () => {
                        text.innerHTML = "";
                        ws = wsA;
                        scene.entities = new Map();
                        players = {};
                        ws.sendPacket = (action, data) => ws.send(JSON.stringify({action, data}));
                        ws.sendPacket("welcome", {token: _token, register: true});
                    }
                    wsA.onmessage = async message => {
                        message = JSON.parse(message.data.toString());
                        switch (message.action) {
                            case "welcome":
                                message.data["players"].forEach(p => registerPlayer(p));
                                selfInfo = {
                                    x: message.data.x,
                                    y: message.data.y,
                                    username: message.data.username,
                                    color: message.data.color,
                                    uuid: message.data.uuid,
                                    token: message.data.token
                                };
                                document["tokens"][config.ip + ":" + config.port] = message.data.token;
                                console.log(JSON.stringify({
                                    action: "Set-Tokens",
                                    data: document["tokens"]
                                }));
                                console.clear();
                                await update_dots(message.data["dots"]);
                                break;
                            case "spawn":
                                registerPlayer(message.data);
                                break;
                            case "despawn":
                                players[message.data.uuid].close();
                                break;
                            case "move":
                                /** @type {Player} */
                                const p = players[message.data.uuid];
                                if (!p) return;
                                p.closed = false;
                                p.x = message.data.x;
                                p.y = message.data.y;
                                break;
                            case "update_size":
                                /** @type {Player} */
                                const pA = players[message.data.uuid];
                                if (!pA) return;
                                pA.closed = false;
                                pA.model.width = message.data.size;
                                break;
                            case "update_dots":
                                await update_dots(message.data["dots"]);
                                break;
                            case "ping":
                                if (!ws.lastPing) return;
                                text.innerHTML = "Ping: " + (Date.now() - ws.lastPing) + "ms";
                                break;
                        }
                    }
                    wsA.onclose = ev => {
                        _kick_reason = ev.reason;
                        ws = null;
                        scene.entities = new Map();
                        text.innerHTML = (_kick_reason ? "Disconnected for reason '" + _kick_reason + "'<br>" : "") + (_rBefore ? "Reconnect failed. " : "") + "Reconnecting in 5 seconds...";
                        _rBefore = true;
                        _active = false;
                        setTimeout(connect, 5000);
                    }
                }

                connect();
                setInterval(() => {
                    document.getElementById("fps").innerHTML = scene.fps + " FPS";
                    if (!ws) return;
                    ws.lastPing = Date.now();
                    ws.sendPacket("ping", {});
                }, 5000);
                let held_keys = {};
                addEventListener("blur", () => held_keys = {});
                addEventListener("keydown", ev => held_keys[ev.key] = true);
                addEventListener("keyup", ev => delete held_keys[ev.key]);

                setInterval(() => {
                    if (!selfInfo) return;
                    /** @type {Player} */
                    const p = players[selfInfo.uuid];
                    let dx = 0;
                    let dy = 0;
                    if (held_keys["w"]) dy--;
                    if (held_keys["a"]) dx--;
                    if (held_keys["s"]) dy++;
                    if (held_keys["d"]) dx++;
                    if (!ws || !p || (dx === 0 && dy === 0)) return;
                    if (dx !== 0 && dy !== 0) {
                        dx *= 0.7;
                        dy *= 0.7;
                    }
                    ws.sendPacket("move", {
                        x: p.x + dx * 5,
                        y: p.y + dy * 5
                    });
                }, 50);
            } catch (e) {
                alert(e);
            }
        }
    } catch
        (e) {
        alert(e);
    }
})
();