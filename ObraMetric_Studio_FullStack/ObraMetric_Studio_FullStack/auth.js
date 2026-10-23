/* AUTENTICACIÓN LOCAL - OBRAMETRIC STUDIO */
(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    const USERS_KEY = "obrametric_users";
    const SESSION_KEY = "obrametric_session";
    const RECORDS_KEY = "obrametric_records";

    const read = key => {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    };

    const save = (key, data) => {
        localStorage.setItem(key, JSON.stringify(data));
    };

    let current = null;

    function getSession() {
        const session = JSON.parse(
            localStorage.getItem(SESSION_KEY) || "null"
        );

        if (!session) return null;

        // Conservar la sesión durante 30 días
        if (Date.now() > session.expires) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }

        return read(USERS_KEY).find(
            user => user.id === session.userId
        ) || null;
    }

    function createSession(user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            userId: user.id,
            expires: Date.now() + 30 * 24 * 60 * 60 * 1000
        }));
        current = user;
    }

    async function request(url, options = {}) {
        const method = options.method || "GET";
        const body = options.body
            ? JSON.parse(options.body)
            : {};

        const users = read(USERS_KEY);
        const records = read(RECORDS_KEY);

        if (url === "/api/register") {
            if (users.some(u => u.email === body.email)) {
                throw new Error("Este correo ya está registrado.");
            }

            if (!["usuario", "admin"].includes(body.role)) {
                throw new Error("Selecciona un rol válido.");
            }

            const user = {
                id: crypto.randomUUID(),
                name: body.name,
                email: body.email,
                password: body.password,
                role: body.role,
                createdAt: new Date().toISOString()
            };

            users.push(user);
            save(USERS_KEY, users);
            createSession(user);

            return { user };
        }

        if (url === "/api/login") {
            const user = users.find(
                u => u.email === body.email &&
                     u.password === body.password
            );

            if (!user) {
                throw new Error(
                    "Correo o contraseña incorrectos."
                );
            }

            createSession(user);
            return { user };
        }

        if (url === "/api/logout") {
            localStorage.removeItem(SESSION_KEY);
            current = null;
            return { ok: true };
        }

        current = getSession();

        if (url === "/api/me") {
            if (!current) {
                throw new Error("No hay sesión activa.");
            }
            return { user: current };
        }

        if (!current) {
            throw new Error("Inicia sesión para continuar.");
        }

        if (url === "/api/admin/users") {
            if (current.role !== "admin") {
                throw new Error("Acceso no autorizado.");
            }

            return {
                users: users.map(u => ({
                    ...u,
                    calculations: records.filter(
                        r => r.userId === u.id
                    ).length
                }))
            };
        }

        if (url === "/api/calculations" && method === "GET") {
            return {
                records: records
                    .filter(r => r.userId === current.id)
                    .sort((a, b) =>
                        b.updatedAt.localeCompare(a.updatedAt)
                    )
            };
        }

        if (url.startsWith("/api/calculations")) {
            const id = url.split("/").pop();

            if (method === "DELETE") {
                save(RECORDS_KEY, records.filter(
                    r => !(r.id === id &&
                           r.userId === current.id)
                ));
                return { ok: true };
            }

            if (method === "POST" || method === "PUT") {
                // Fórmulas según los requisitos del proyecto
                const v = body.inputs;
                const type = body.type;
                const item = (label, amount, unit) => ({
                    label, amount, unit
                });

                let result = [];

                if (type === "muro") {
                    const a = v.largo * v.alto;
                    const thick = v.espesor === 30;
                    result = [
                        item("Superficie", a, "m²"),
                        item("Cemento", a * (thick ? 15.2 : 10.9), "kg"),
                        item("Arena", a * (thick ? 0.115 : 0.09), "m³"),
                        item("Ladrillos", a * (thick ? 120 : 90), "unidades")
                    ];
                } else if (type === "viga") {
                    result = [
                        item("Cemento", v.largo * 9, "kg"),
                        item("Arena", v.largo * 0.02, "m³"),
                        item("Piedra", v.largo * 0.02, "m²"),
                        item("Hierro Ø 8", v.largo * 4, "m"),
                        item("Hierro Ø 4", v.largo * 3, "m")
                    ];
                } else if (type === "columna") {
                    result = [
                        item("Cemento", v.largo * 7.5, "kg"),
                        item("Arena", v.largo * 0.016, "m³"),
                        item("Piedra", v.largo * 0.016, "m²"),
                        item("Hierro Ø 10", v.largo * 6, "m"),
                        item("Hierro Ø 4", v.largo * 3, "m")
                    ];
                } else if (type === "contrapiso") {
                    const vol = v.espesor / 100 * v.ancho * v.largo;
                    result = [
                        item("Volumen", vol, "m³"),
                        item("Cemento", vol * 105, "kg"),
                        item("Arena", vol * 0.45, "m³"),
                        item("Piedra", vol * 0.9, "m³")
                    ];
                } else if (type === "techo") {
                    const a = v.ancho * v.largo;
                    result = [
                        item("Superficie", a, "m²"),
                        item("Cemento", a * 33, "kg"),
                        item("Arena", a * 0.072, "m³"),
                        item("Piedra", a * 0.072, "m³"),
                        item("Hierro Ø 8", a * 7, "m"),
                        item("Hierro Ø 6", a * 4, "m")
                    ];
                } else if (type === "pisos") {
                    const a = v.ancho * v.largo;
                    result = [
                        item("Superficie base", a, "m²"),
                        item("Recortes (10 %)", a * 0.1, "m²"),
                        item("Superficie total", a * 1.1, "m²")
                    ];
                } else if (type === "pintura") {
                    result = [
                        item("Superficie", v.superficie, "m²"),
                        item("Pintura necesaria", v.superficie / 6, "L")
                    ];
                } else {
                    throw new Error("Tipo de cálculo inválido.");
                }

                const now = new Date().toISOString();

                if (method === "PUT") {
                    const record = records.find(
                        r => r.id === id &&
                             r.userId === current.id
                    );
                    if (!record) {
                        throw new Error("Registro no encontrado.");
                    }
                    Object.assign(record, {
                        type, inputs: v, result, updatedAt: now
                    });
                    save(RECORDS_KEY, records);
                    return { record };
                }

                const record = {
                    id: crypto.randomUUID(),
                    userId: current.id,
                    type,
                    inputs: v,
                    result,
                    createdAt: now,
                    updatedAt: now
                };

                records.push(record);
                save(RECORDS_KEY, records);
                return { record };
            }
        }

        throw new Error("Operación no disponible.");
    }

    async function logout() {
        await request("/api/logout", { method: "POST" });
        location.replace("index.html");
    }

    window.ObraAuth = {
        getSession: () => current,
        logout,
        request
    };

    async function start() {
        current = getSession();

        const isDashboard =
            location.pathname.endsWith("dashboard.html");

        if (isDashboard) {
            if (!current) {
                location.replace("index.html");
                return;
            }

            document.dispatchEvent(new Event("obra:ready"));
            return;
        }

        if (current) {
            location.replace("dashboard.html");
            return;
        }

        const form = $("auth-form");
        if (!form) return;

        let register = false;
        const message = $("auth-message");

        function mode(value) {
            register = value;

            ["name-field", "confirm-field", "role-field"]
                .forEach(id => {
                    $(id).classList.toggle("hidden", !value);
                });

            $("login-tab").classList.toggle("active", !value);
            $("register-tab").classList.toggle("active", value);

            $("login-tab").setAttribute(
                "aria-pressed", String(!value)
            );
            $("register-tab").setAttribute(
                "aria-pressed", String(value)
            );

            $("auth-heading").textContent = value
                ? "Crea tu cuenta"
                : "Accede a tu espacio";

            $("auth-subtitle").textContent = value
                ? "Elige tu rol y comienza a organizar tus proyectos."
                : "Bienvenida de nuevo. Tu espacio está listo para ti.";

            $("submit-auth").textContent = value
                ? "Crear mi cuenta →"
                : "Entrar a mi espacio →";

            $("password").autocomplete = value
                ? "new-password"
                : "current-password";

            message.textContent = "";
        }

        $("login-tab").onclick = () => mode(false);
        $("register-tab").onclick = () => mode(true);

        form.addEventListener("submit", async e => {
            e.preventDefault();
            message.textContent = "";

            const email = $("email").value.trim().toLowerCase();
            const password = $("password").value;

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                message.textContent = "Ingresa un correo válido.";
                return;
            }

            if (password.length < 8) {
                message.textContent =
                    "La contraseña debe tener al menos 8 caracteres.";
                return;
            }

            const values = { email, password };

            if (register) {
                values.name = $("full-name").value.trim();
                values.role = $("role").value;

                if (values.name.length < 2) {
                    message.textContent =
                        "Escribe tu nombre completo.";
                    return;
                }

                if (password !== $("confirm-password").value) {
                    message.textContent =
                        "Las contraseñas no coinciden.";
                    return;
                }
            }

            const btn = $("submit-auth");
            btn.disabled = true;

            try {
                await request(
                    register ? "/api/register" : "/api/login",
                    {
                        method: "POST",
                        body: JSON.stringify(values)
                    }
                );

                location.replace("dashboard.html");
            } catch (err) {
                message.textContent = err.message;
                btn.disabled = false;
            }
        });
    }

    start();
})();
