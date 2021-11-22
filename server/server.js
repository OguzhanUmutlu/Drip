const express = require("express");
const app = express();
const WS = require("ws");
const wss = new WS.WebSocketServer({port: require("./config.json").port});
const sqlite = require("better-sqlite3")("./sqlite.db");
global.sqlite = sqlite;
const {WebSocket} = require("ws");

/**
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @returns {number}
 */
function distance(from, to) {
    return Math.sqrt(Math.pow(from.x - to.x, 2) + Math.pow(from.y - to.y, 2));
}

/*** @returns {{x: number, y: number} | null} */
const get_random_spawn = async () => {
    let randoms = [];
    for (let x = 0; x <= 1200; x++) {
        for (let y = 0; y <= 700; y++) {
            if (!Object.values(global.clients).filter(cli => cli.logged).some(cli => cli.distance({x, y}) < 50))
                randoms.push({x, y});
        }
    }
    return randoms[Math.floor(Math.random() * randoms.length)];
}

class Client {
    /**
     * @param {number} session_id
     * @param {WebSocket} ws
     */
    constructor(session_id, ws) {
        this.session_id = session_id;
        this.ws = ws;
        this.logged = false;
    }

    get_middle_pos() {
        return {
            x: this.x + this.size / 2,
            y: this.y + this.size / 2
        };
    }

    /**
     * @param {number} x
     * @param {number} y
     * @return {number}
     */
    distance({x, y}) {
        return distance({x, y}, this.get_middle_pos());
    }

    /**
     * @param {number} uuid
     * @param {number} x
     * @param {number} y
     * @param {string} token
     * @param {string} username
     * @param {string} color
     * @param {boolean} banned
     */
    login(uuid, x, y, token, username, color, banned) {
        this.uuid = uuid;
        this.x = x;
        this.y = y;
        this.size = 10;
        this.token = token;
        this.username = username;
        this.color = color;
        this.banned = banned;
        this.logged = true;
    }

    /*** @param {string} username */
    setUsername(username) {
        if (!this.logged) return;
        this.username = username;
        global.sqlite.exec(`UPDATE users
                            SET username = '${username.replaceAll(`'`, `\\'`)}'
                            WHERE uuid = ${this.uuid}`);
    }

    /*** @param {string} color */
    setColor(color) {
        if (!this.logged) return;
        this.color = color;
        global.sqlite.exec(`UPDATE users
                            SET color = '${color}'
                            WHERE uuid = ${this.uuid}`);
    }

    /*** @param {boolean | null} value */
    setBanned(value = true) {
        if (!this.logged) return;
        this.banned = value;
        global.sqlite.exec(`UPDATE users
                            SET banned = ${value ? 1 : 0}
                            WHERE uuid = ${this.uuid}`);
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    teleport(x, y) {
        if (!this.logged) return;
        this.x = x;
        this.y = y;
    }

    /**
     * @param {string} action
     * @param {Object} data
     */
    sendPacket(action, data) {
        this.ws.send(JSON.stringify({action, data}));
    }

    /*** @param {string} reason */
    kick(reason) {
        this.ws.close(1001, reason);
    }
}

class Dot {
    constructor(x, y, uuid) {
        this.x = x;
        this.y = y;
        this.size = Math.floor(Math.random() * 3) + 1;
        this.color = "#" + Math.floor(Math.random() * 16777215).toString(16);
        this.uuid = uuid;
    }

    encode() {
        return {
            x: this.x,
            y: this.y,
            size: this.size,
            color: this.color,
            uuid: this.uuid
        };
    }
}

const get_user_by_token = (token) => {
    return sqlite.prepare(`SELECT *
                           FROM users
                           WHERE token = '${token}'`).all()[0];
}
const _gen_tok = (_l = 50) => {
    const _r = "abcdefghijklmnoprstuvyzqwxABCDEFGHIJKLMNOPRSTUVYZQWX0123456789!^+%&/()=?";
    return [..." ".repeat(_l)].map(() => [..._r][Math.floor(Math.random() * _r.length)]).join("");
}
const generate_token = () => {
    let token;
    while (get_user_by_token(token = _gen_tok())) {
    }
    return token;
}
sqlite.exec(`CREATE TABLE IF NOT EXISTS users
             (
                 uuid     INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                 token    TEXT    NOT NULL,
                 username TEXT             DEFAULT NULL,
                 color    TEXT,
                 banned   INTEGER NOT NULL DEFAULT 0
             )`);
/*** @type {Object<number, Client>} */
global.clients = {};
/*** @type {Object<number, Dot>} */
global.dots = {};

setInterval(async () => {
    if (Object.keys(global["dots"]).length > 40) return;
    let spawned = false;
    if (Object.keys(global["dots"]).length < 30) {
        let rand = await get_random_spawn();
        if (rand) {
            spawned = true;
            let uI = __session_id++;
            global.dots[uI] = new Dot(rand.x, rand.y, uI);
        }
    }
    if (spawned) {
        broadcastPacket("update_dots", {
            dots: await encode_dots()
        });
    }
}, 800);

const encode_dots = async () => {
    let obj = {};
    Object.keys(global.dots).forEach(key => obj[key] = global.dots[key].encode());
    return obj;
}
const broadcastPacket = (action, data = {}, logged = true) => {
    let cli = Object.values(global.clients);
    if (logged) cli = cli.filter(i => i.logged);
    cli.forEach(client => client.sendPacket(action, data));
}
let __session_id = 0;

wss.on("connection", ws => {
    global.clients[(ws.client = new Client(ws.session_id = __session_id++, ws)).session_id] = ws.client;
    ws.on("message", async message => {
        let json;
        try {
            json = JSON.parse(message.toString());
        } catch (e) {
        }
        if (typeof json !== "object" || typeof json.action !== "string" || typeof json.data !== "object") return;
        switch (json.action) {
            case "welcome":
                if (ws.closed || ws.client.logged) return;
                const data = {
                    players: Object.values(global.clients).filter(i => i !== ws.client).map(i => {
                        return {
                            x: i.x,
                            y: i.y,
                            username: i.username,
                            color: i.color,
                            uuid: i.session_id
                        }
                    })
                };
                let random = await get_random_spawn();
                if (!random) return ws.client.kick("There are no empty places in this server!");
                if (json.data.token) {
                    let u;
                    if (!(u = get_user_by_token(json.data.token || ""))) return ws.client.kick("Invalid token!");
                    if (Object.values(global.clients).some(i => i.token === u.token)) return ws.client.kick("You are already logged in with this account!");
                    ws.client.login(u.uuid, random.x, random.y, u.token, u.username, u.color, u.banned === 1);
                } else if (json.data.register) {
                    let token = generate_token();
                    sqlite.exec(`INSERT INTO users (token, color)
                                 VALUES ('${token}', '#${Math.floor(Math.random() * 16777215).toString(16)}')`);
                    data.token = token;
                    let u = get_user_by_token(token);
                    ws.client.login(u.uuid, random.x, random.y, u.token, u.username, u.color, u.banned === 1);
                } else return;
                if (!ws.client.logged) return;
                data.x = ws.client.x;
                data.y = ws.client.y;
                data.username = ws.client.username;
                data.color = ws.client.color;
                data.uuid = ws.client.session_id;
                data.token = ws.client.token;
                data.dots = await encode_dots();
                ws.client.sendPacket("welcome", data);
                broadcastPacket("spawn", {
                    x: ws.client.x,
                    y: ws.client.y,
                    username: ws.client.username,
                    color: ws.client.color,
                    uuid: ws.client.session_id
                });
                break;
            case "move":
                if (!ws.client.logged) return;
                if (["x", "y"].some(i => !Object.keys(json.data).includes(i))) return;
                if (json.data.x < 0) json.data.x = 0;
                if (json.data.y < 0) json.data.y = 0;
                if (json.data.x > 1200 - ws.client.size) json.data.x = 1200 - ws.client.size;
                if (json.data.y > 700 - ws.client.size) json.data.y = 700 - ws.client.size;
                ws.client.teleport(json.data.x, json.data.y);
                broadcastPacket("move", {
                    x: ws.client.x,
                    y: ws.client.y,
                    uuid: ws.client.session_id
                });
                const colliding_dots = Object.values(global.dots).filter(i => ws.client.distance({
                    x: i.x + i.size / 2,
                    y: i.y + i.size / 2
                }) <= (ws.client.size + i.size) / 2);
                const colliding_players = Object.values(global.clients)
                    .filter(i => i.uuid !== ws.client.uuid)
                    .filter(i => ws.client.distance({
                        x: i.x + i.size / 2,
                        y: i.y + i.size / 2
                    }) <= (ws.client.size + i.size) / 2)
                    .filter(i=> Math.abs(ws.client.size - i.size) > 5);
                colliding_players.forEach(player => {
                    if(player.size > ws.client.size) {
                        player.size += ws.client.size;
                        ws.client.kick("You died!");
                        broadcastPacket("update_size", {
                            size: player.size,
                            uuid: player.session_id
                        });
                    } else {
                        ws.client.size += player.size;
                        player.kick("You died!");
                        broadcastPacket("update_size", {
                            size: ws.client.size,
                            uuid: ws.client.session_id
                        });
                    }
                });
                for (const dot of colliding_dots) {
                    delete global.dots[dot.uuid];
                    let ui = __session_id++;
                    let rand = await get_random_spawn();
                    if (rand) global.dots[ui] = new Dot(rand.x, rand.y, ui);
                    ws.client.size += dot.size;
                }
                if (colliding_dots.length > 0) {
                    broadcastPacket("update_size", {
                        size: ws.client.size,
                        uuid: ws.client.session_id
                    });
                    broadcastPacket("update_dots", {
                        dots: await encode_dots()
                    });
                }
                break;
            case "ping":
                if (!ws.client.logged) return;
                ws.client.sendPacket("ping", {});
                break;
            case "leave":
                ws.client.kick("leave");
                break;
        }
    });
    ws.on("close", () => {
        delete global.clients[ws.client.session_id];
        broadcastPacket("despawn", {
            uuid: ws.client.session_id
        });
    });
});

app.get("/api/", (req, res) => {
    res.json({type: "DripHost", port: wss.options.port, description: require("./config.json").name});
});

app.listen(80);