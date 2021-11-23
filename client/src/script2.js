let page = 0;
window.onload = async () => {
    let last = null;
    let trying = false;
    let connect = document.getElementById("connect");
    let max_fps = document.getElementById("max_fps");
    let max_fps_view = document.getElementById("max_fps_view");
    let ui = document.getElementById("ui");
    let main_menu_ui = document.getElementById("main_menu_ui");
    let add_server_ui = document.getElementById("add_server");
    let servers_ui = document.getElementById("servers_ui");
    let settings_ui = document.getElementById("settings_ui");
    let current = null;
    setInterval(() => {
        if (ui.hidden) return;
        max_fps_view.innerHTML = max_fps.value;
        document.getElementById("change_page").hidden = page === 0 ? true : undefined;
        const ipDoc = document.getElementById("ip");
        const portDoc = document.getElementById("port");
        const nameDoc = document.getElementById("name");
        switch (page) {
            case 0:
                add_server_ui.hidden = true;
                servers_ui.hidden = true;
                settings_ui.hidden = true;
                main_menu_ui.hidden = undefined;
                break;
            case 1:
                ipDoc.value = "";
                portDoc.value = "";
                nameDoc.value = "";
                add_server_ui.hidden = true;
                servers_ui.hidden = undefined;
                settings_ui.hidden = true;
                main_menu_ui.hidden = true;
                break;
            case 2:
                add_server_ui.hidden = undefined;
                servers_ui.hidden = true;
                settings_ui.hidden = true;
                main_menu_ui.hidden = true;
                nameDoc.placeholder = ipDoc.value.toString() + ":" + (portDoc.value || 19132).toString();
                let info = {
                    ip: ipDoc.value.toLowerCase(),
                    port: portDoc.value * 1 || 19132
                };
                info.secure = info.ip !== "localhost";
                if (JSON.stringify(info) === JSON.stringify(last)) return;
                if (current) current.abort();
                if (!info.port * 1 || info.ip.split("").some(i => !"abcdefghijklmnoprstuvyzqwx0123456789.-".includes(i))) return connect.innerHTML = "Invalid server.";
                connect.innerHTML = "Checking...";
                last = info;
                trying = true;
                const xml = new XMLHttpRequest();
                current = xml;
                xml.open("GET", `http${info.secure ? "s" : ""}://${info.ip}/api`, true);
                xml.timeout = 2000;
                xml.onreadystatechange = () => {
                    if (xml.readyState === xml.DONE) {
                        let found = -1;
                        if (xml.responseText) {
                            let json;
                            try {
                                json = JSON.parse(xml.responseText.toString());
                            } catch (e) {
                            }
                            if (json && json.type === "DripHost") {
                                found = json.port === info.port ? 1 : 0;
                            }
                        }
                        trying = false;
                        document.getElementById("submit").disabled = found > 0 ? undefined : true;
                        connect.innerHTML = {
                            "-1": "Invalid server.",
                            0: "Invalid port.",
                            1: "Server found."
                        }[found];
                    }
                };
                xml.send();
                break;
            case 3:
                add_server_ui.hidden = true;
                servers_ui.hidden = true;
                settings_ui.hidden = undefined;
                main_menu_ui.hidden = true;
                break;
        }
    }, 100);
};