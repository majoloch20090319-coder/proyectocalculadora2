/**
 * Módulo Principal - ObraMetric Studio
 * Gestión de UI, Cálculos y CRUD del historial.
 */
(function () {
    'use strict';

    // --- Verificación de Sesión ---
    const auth = window.ObraAuth;
    let user = auth && auth.getSession();
    if (!user) { document.addEventListener('obra:ready', initialize, {once:true}); return; }
    initialize();
    function initialize() {
    user = auth.getSession();
    if (!user) { location.replace("/index.html"); return; }

    // --- Utilidades ---
    const $ = (id) => document.getElementById(id);
    const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
    const fmt = (n) => nf.format(n);
    let records = [];
    const getRecords = () => records;
    async function refreshRecords(){const data=await auth.request('/api/calculations');records=data.records;renderHistory();}


    // --- Motor de Cálculos (Lógica Pura) ---
    const CalculadoraMatematica = {
        muro: (v) => {
            const area = v.largo * v.alto, thick = v.espesor === 30;
            return [
                { label: 'Superficie', amount: area, unit: 'm²' },
                { label: 'Cemento', amount: area * (thick ? 15.2 : 10.9), unit: 'kg' },
                { label: 'Arena', amount: area * (thick ? 0.115 : 0.09), unit: 'm³' },
                { label: 'Ladrillos', amount: area * (thick ? 120 : 90), unit: 'unidades' }
            ];
        },
        viga: (v) => [
            { label: 'Cemento', amount: v.largo * 9, unit: 'kg' },
            { label: 'Arena', amount: v.largo * 0.02, unit: 'm³' },
            { label: 'Piedra', amount: v.largo * 0.02, unit: 'm²' },
            { label: 'Hierro Ø 8', amount: v.largo * 4, unit: 'm' },
            { label: 'Hierro Ø 4', amount: v.largo * 3, unit: 'm' }
        ],
        columna: (v) => [
            { label: 'Cemento', amount: v.largo * 7.5, unit: 'kg' },
            { label: 'Arena', amount: v.largo * 0.016, unit: 'm³' },
            { label: 'Piedra', amount: v.largo * 0.016, unit: 'm²' },
            { label: 'Hierro Ø 10', amount: v.largo * 6, unit: 'm' },
            { label: 'Hierro Ø 4', amount: v.largo * 3, unit: 'm' }
        ],
        contrapiso: (v) => {
            const volume = (v.espesor / 100) * v.ancho * v.largo;
            return [
                { label: 'Volumen', amount: volume, unit: 'm³' },
                { label: 'Cemento', amount: volume * 105, unit: 'kg' },
                { label: 'Arena', amount: volume * 0.45, unit: 'm³' },
                { label: 'Piedra', amount: volume * 0.9, unit: 'm³' }
            ];
        },
        techo: (v) => {
            const area = v.ancho * v.largo;
            return [
                { label: 'Superficie', amount: area, unit: 'm²' },
                { label: 'Cemento', amount: area * 33, unit: 'kg' },
                { label: 'Arena', amount: area * 0.072, unit: 'm³' },
                { label: 'Piedra', amount: area * 0.072, unit: 'm³' },
                { label: 'Hierro Ø 8', amount: area * 7, unit: 'm' },
                { label: 'Hierro Ø 6', amount: area * 4, unit: 'm' }
            ];
        },
        pisos: (v) => {
            const area = v.ancho * v.largo;
            return [
                { label: 'Superficie base', amount: area, unit: 'm²' },
                { label: 'Recortes (10 %)', amount: area * 0.1, unit: 'm²' },
                { label: 'Superficie total', amount: area * 1.1, unit: 'm²' }
            ];
        },
        pintura: (v) => [
            { label: 'Superficie', amount: v.superficie, unit: 'm²' },
            { label: 'Pintura necesaria', amount: v.superficie / 6, unit: 'L' }
        ]
    };

    // --- Configuración de Formularios ---
    const definicionesUI = {
        muro: { 
            title: 'Muro de ladrillo', 
            desc: 'Calcula superficie, cemento, arena y ladrillos según el espesor.', 
            fields: [
                { id: 'espesor', label: 'Espesor del muro', type: 'select', options: [['20', '20 cm'], ['30', '30 cm']] }, 
                { id: 'largo', label: 'Largo', unit: 'm' }, 
                { id: 'alto', label: 'Alto', unit: 'm' }
            ] 
        },
        viga: { 
            title: 'Viga de hormigón', 
            desc: 'Cantidad de materiales por metro lineal de viga.', 
            fields: [{ id: 'largo', label: 'Largo de la viga', unit: 'm' }] 
        },
        columna: { 
            title: 'Columna de hormigón', 
            desc: 'Cantidad de materiales por metro lineal de columna.', 
            fields: [{ id: 'largo', label: 'Largo de la columna', unit: 'm' }] 
        },
        contrapiso: { 
            title: 'Contrapiso', 
            desc: 'Ingresa el espesor en centímetros; el cálculo convierte el espesor a metros.', 
            fields: [
                { id: 'espesor', label: 'Espesor', unit: 'cm' }, 
                { id: 'ancho', label: 'Ancho', unit: 'm' }, 
                { id: 'largo', label: 'Largo', unit: 'm' }
            ] 
        },
        techo: { 
            title: 'Techo', 
            desc: 'Las cantidades se calculan por m². El espesor es informativo.', 
            fields: [
                { id: 'espesor', label: 'Espesor (informativo)', unit: 'cm' }, 
                { id: 'ancho', label: 'Ancho', unit: 'm' }, 
                { id: 'largo', label: 'Largo', unit: 'm' }
            ] 
        },
        pisos: { 
            title: 'Pisos', 
            desc: 'Superficie con un 10 % adicional para recortes.', 
            fields: [
                { id: 'ancho', label: 'Ancho', unit: 'm' }, 
                { id: 'largo', label: 'Largo', unit: 'm' }
            ] 
        },
        pintura: { 
            title: 'Pintura', 
            desc: 'Rendimiento fijo: 6 m² por litro.', 
            fields: [{ id: 'superficie', label: 'Superficie del muro', unit: 'm²' }] 
        }
    };

    // --- Estado de la UI ---
    let activeType = null;
    let editingId = null;

    // --- Inicialización de Perfil ---
    $('user-initial').textContent = (user.name.charAt(0) || 'U').toUpperCase();
    $('user-name').textContent = user.name;
    $('user-role').textContent = user.role === 'admin' ? 'Administradora / Admin' : 'Usuario';
    if(user.role==='admin'){ $('admin-panel').classList.remove('hidden'); loadAdmin(); }
    async function loadAdmin(){try{const data=await auth.request('/api/admin/users');const body=$('admin-users-body');body.replaceChildren();for(const u of data.users){const tr=document.createElement('tr');for(const value of [u.name,u.email,u.role==='admin'?'Administrador':'Usuario',String(u.calculations),new Date(u.createdAt).toLocaleDateString('es-CO')]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}}catch(e){console.error(e);}}
    $('welcome-name').textContent = user.name.split(' ')[0];
    $('today-label').textContent = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

    // --- Eventos Globales ---
    $('logout-btn').addEventListener('click', auth.logout);
    $('exit-card').addEventListener('click', auth.logout);
    $('exit-secondary').addEventListener('click', auth.logout);

    // Menú Móvil
    const menu = $('sidebar'), toggle = $('menu-toggle'), overlay = $('menu-overlay');
    const setMenu = (open) => {
        menu.classList.toggle('open', open);
        overlay.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
    overlay.addEventListener('click', () => setMenu(false));
    document.querySelectorAll('.sidebar-nav a').forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

    // --- Lógica de la Calculadora (UI) ---
    document.querySelectorAll('[data-calculator]').forEach((b) => {
        b.addEventListener('click', () => openCalculator(b.dataset.calculator));
    });
    $('close-calculator').addEventListener('click', () => { 
        $('workspace').classList.add('hidden'); 
        editingId = null; 
    });

    function openCalculator(type, existing = null) {
        if (!definicionesUI[type]) return;
        activeType = type;
        editingId = existing ? existing.id : null;
        const def = definicionesUI[type];

        $('calc-heading').textContent = (existing ? 'Editar · ' : '') + def.title;
        $('calc-help').textContent = def.desc;
        $('calculator-message').textContent = '';
        $('calculator-message').classList.remove('success');
        
        const container = $('dynamic-fields');
        container.replaceChildren();

        // Generación dinámica de campos
        for (const field of def.fields) {
            const wrapper = document.createElement('div'); 
            wrapper.className = 'field';
            const label = document.createElement('label'); 
            label.htmlFor = 'f_' + field.id; 
            label.textContent = field.label;
            
            let input;
            if (field.type === 'select') {
                input = document.createElement('select');
                for (const [value, text] of field.options) { 
                    const option = document.createElement('option'); 
                    option.value = value; 
                    option.textContent = text; 
                    input.append(option); 
                }
            } else { 
                input = document.createElement('input'); 
                input.type = 'number'; 
                input.min = '0.000001'; 
                input.step = 'any'; 
                input.placeholder = 'Ej. 2.5'; 
                input.inputMode = 'decimal'; 
            }
            
            input.id = 'f_' + field.id; 
            input.name = field.id; 
            input.required = true;
            if (existing && existing.inputs[field.id]) {
                input.value = existing.inputs[field.id];
            }

            if (field.unit && field.type !== 'select') { 
                const unitWrap = document.createElement('div'); 
                unitWrap.className = 'input-with-unit'; 
                const span = document.createElement('span'); 
                span.textContent = field.unit; 
                unitWrap.append(input, span); 
                wrapper.append(label, unitWrap); 
            } else {
                wrapper.append(label, input);
            }
            container.append(wrapper);
        }

        // Resetear panel de resultados
        const panel = $('result-panel');
        panel.replaceChildren();
        const resLabel = document.createElement('span'); 
        resLabel.className = 'result-label'; 
        resLabel.textContent = 'RESULTADO';
        const placeholder = document.createElement('div'); 
        placeholder.className = 'result-placeholder'; 
        placeholder.textContent = existing ? 'Modifica las medidas y guarda los cambios.' : 'Completa las medidas para obtener el resultado.';
        panel.append(resLabel, placeholder);
        
        $('calculator-form').querySelector('button[type=submit]').textContent = existing ? 'Actualizar cálculo →' : 'Calcular y guardar →';
        $('workspace').classList.remove('hidden');
        $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderResult(result) {
        const panel = $('result-panel'); 
        panel.replaceChildren();
        const title = document.createElement('span'); 
        title.className = 'result-label'; 
        title.textContent = 'RESULTADO DEL CÁLCULO'; 
        panel.append(title);

        for (const r of result) { 
            const row = document.createElement('div'); 
            row.className = 'result-row'; 
            const label = document.createElement('span'); 
            label.textContent = r.label; 
            const value = document.createElement('strong'); 
            value.textContent = fmt(r.amount) + ' ' + r.unit; 
            row.append(label, value); 
            panel.append(row); 
        }
        
        const info = document.createElement('p'); 
        info.className = 'result-note'; 
        info.textContent = 'Cantidades teóricas; no incluyen otros desperdicios salvo el 10 % de pisos.'; 
        panel.append(info);
    }

    // --- Submit del Formulario de Cálculo ---
    $('calculator-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('calculator-message').classList.remove('success');
        if (!activeType) return;

        const values = {};
        let isValid = true;

        // Validación estricta de inputs
        for (const field of definicionesUI[activeType].fields) {
            const raw = $('f_' + field.id).value.trim();
            const n = Number(raw);
            if (raw === '' || !Number.isFinite(n) || n <= 0 || n > 1000000 || (field.type === 'select' && !field.options.some(([val]) => Number(val) === n))) {
                $('calculator-message').textContent = 'Completa todas las medidas con números válidos mayores a cero (máx 1.000.000).';
                $('f_' + field.id).focus(); 
                isValid = false;
                break;
            }
            values[field.id] = n;
        }
        if (!isValid) return;

        // Calcular usando el motor matemático
        const result = CalculadoraMatematica[activeType](values);
        if (result.some((r) => !Number.isFinite(r.amount))) { 
            $('calculator-message').textContent = 'Error en el cálculo. Revisa las dimensiones.'; 
            return; 
        }

        // El servidor vuelve a validar y calcular antes de guardar.
        let saved;
        try { saved = await auth.request(editingId ? '/api/calculations/' + encodeURIComponent(editingId) : '/api/calculations', {
            method: editingId ? 'PUT' : 'POST', body: JSON.stringify({type:activeType,inputs:values})
        }); } catch(err){ $('calculator-message').textContent=err.message;return; }
        const wasEditing=Boolean(editingId);
        await refreshRecords();
        if(user.role==='admin') loadAdmin();
        renderResult(result);
        $('calculator-message').textContent = wasEditing ? 'Cálculo actualizado.' : 'Cálculo guardado.';
        $('calculator-message').classList.add('success');
        editingId = null;
        $('calculator-form').querySelector('button[type=submit]').textContent = 'Calcular y guardar →';
        renderHistory();
    });

    // --- Tabla de Historial (Render y Eventos) ---
    $('history-body').addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        
        const target = getRecords().find((r) => r.id === button.dataset.id);
        if (!target) return;

        if (button.dataset.action === 'edit') { 
            openCalculator(target.type, target); 
            return; 
        }
        
        if (button.dataset.action === 'delete' && window.confirm('¿Eliminar este cálculo del historial?')) {
            try { await auth.request('/api/calculations/'+encodeURIComponent(target.id),{method:'DELETE'});await refreshRecords();if(user.role==='admin')loadAdmin(); } catch(err) {window.alert(err.message);}
        }
    });

    function renderHistory() {
        const all = getRecords();
        const body = $('history-body'); 
        body.replaceChildren();
        
        $('empty-history').classList.toggle('hidden', all.length > 0);
        $('history-count').textContent = all.length + (all.length === 1 ? ' registro' : ' registros');
        $('total-calculations').textContent = fmt(all.length);
        $('types-used').textContent = new Set(all.map((r) => r.type)).size + ' / 7';
        
        let latest = 'Sin registros';
        if (all.length) {
            const maxDate = all.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b).updatedAt;
            latest = new Date(maxDate).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
        }
        $('latest-calculation').textContent = latest;

        const summary = (result) => result.map((r) => `${r.label}: ${fmt(r.amount)} ${r.unit}`).join(' · ');
        const getDate = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

        for (const item of all) {
            if (!definicionesUI[item.type] || !Array.isArray(item.result)) continue;
            
            const tr = document.createElement('tr');
            const tdDate = document.createElement('td'); 
            tdDate.textContent = getDate(item.updatedAt);
            const tdType = document.createElement('td'); 
            tdType.textContent = definicionesUI[item.type].title; 
            tdType.className = 'history-type';
            const tdSummary = document.createElement('td'); 
            tdSummary.textContent = summary(item.result); 
            tdSummary.className = 'history-summary';
            const tdActions = document.createElement('td'); 
            tdActions.className = 'row-actions';
            
            [['edit', 'Editar'], ['delete', 'Eliminar']].forEach(([action, label]) => { 
                const b = document.createElement('button'); 
                b.type = 'button'; 
                b.className = 'action-btn' + (action === 'delete' ? ' danger' : ''); 
                b.dataset.action = action; 
                b.dataset.id = item.id; 
                b.textContent = label; 
                tdActions.append(b); 
            });
            
            tr.append(tdDate, tdType, tdSummary, tdActions); 
            body.append(tr);
        }
    }

    // Inicializar historial
    refreshRecords().catch(err=>console.error(err));
    }
})();