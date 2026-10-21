let currentView = 'view-dashboard';
let currentDate = new Date();
let selectedCalendarDate = new Date().toISOString().split('T')[0];
let entries = [];
let hourlyWage = 12.00;
let hoursChartInstance = null;
let earningsChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
    setupNavigation();
    setupEventListeners();
});

async function initApp() {
    try {
        const savedWage = await db.getSetting('hourlyWage', 12.00);
        hourlyWage = savedWage !== null && savedWage !== undefined ? Number(savedWage) : 12.00;
    } catch (e) {
        hourlyWage = 12.00;
    }

    document.getElementById('setting-wage').value = hourlyWage.toFixed(2);
    document.getElementById('kpi-wage').textContent = `${hourlyWage.toFixed(2).replace('.', ',')} €`;

    entries = await db.getAllEntries();
    
    if (entries.length === 0) {
        await loadDemoData();
    } else {
        refreshUI();
    }
}

function refreshUI() {
    updateDashboard();
    renderCalendar();
    updateStats();
}

// Navigation zwischen Views
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-target');
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
            currentView = target;

            if (target === 'view-stats') {
                renderCharts();
            }
        });
    });
}

function setupEventListeners() {
    // Echtzeit-Uhr
    setInterval(() => {
        const now = new Date();
        document.getElementById('current-time-display').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + now.toLocaleTimeString('de-DE');
    }, 1000);

    // Modal Steuerung
    const modal = document.getElementById('entry-modal');
    document.getElementById('btn-quick-add').addEventListener('click', () => openModal(selectedCalendarDate));
    document.getElementById('btn-cancel-modal').addEventListener('click', () => modal.classList.remove('active'));
    document.querySelector('.close-modal').addEventListener('click', () => modal.classList.remove('active'));

    // Formular Live-Vorschau & Absenden
    const form = document.getElementById('entry-form');
    ['input-start', 'input-end', 'input-break'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateModalPreview);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('entry-id').value;
        const entry = {
            date: document.getElementById('input-date').value,
            start: document.getElementById('input-start').value,
            end: document.getElementById('input-end').value,
            breakMins: Number(document.getElementById('input-break').value),
            type: document.getElementById('input-type').value,
            note: document.getElementById('input-note').value
        };
        if (id) entry.id = Number(id);

        await db.saveEntry(entry);
        entries = await db.getAllEntries();
        modal.classList.remove('active');
        refreshUI();
    });

    // Kalender Navigation
    document.getElementById('cal-prev').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    document.getElementById('cal-today').addEventListener('click', () => {
        currentDate = new Date();
        renderCalendar();
    });

    // Einstellungen speichern
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        const val = parseFloat(document.getElementById('setting-wage').value);
        if (!isNaN(val) && val >= 0) {
            hourlyWage = val;
            await db.saveSetting('hourlyWage', hourlyWage);
            refreshUI();
            alert('Einstellungen erfolgreich gespeichert.');
        } else {
            alert('Bitte gültigen Stundenlohn eingeben.');
        }
    });

    // PDF Export
    document.getElementById('btn-export-pdf').addEventListener('click', () => {
        const monthVal = document.getElementById('pdf-month').value;
        const empName = document.getElementById('pdf-employee').value;
        if (!monthVal) return alert('Bitte Monat auswählen.');
        exportTimesheetPDF(monthVal, empName, hourlyWage, entries);
    });

    // JSON Export / Import
    document.getElementById('btn-json-export').addEventListener('click', async () => {
        const data = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            hourlyWage,
            entries
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zeiterfassung_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    });

    document.getElementById('btn-json-import').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.entries && Array.isArray(data.entries)) {
                    if (confirm('Vorhandene Daten überschreiben / ergänzen?')) {
                        for (let ent of data.entries) {
                            delete ent.id; // Neue IDs vergeben
                            await db.saveEntry(ent);
                        }
                        if (data.hourlyWage) {
                            hourlyWage = data.hourlyWage;
                            await db.saveSetting('hourlyWage', hourlyWage);
                        }
                        entries = await db.getAllEntries();
                        refreshUI();
                        alert('Import erfolgreich!');
                    }
                } else {
                    alert('Ungültiges Dateiformat.');
                }
            } catch (err) {
                alert('Fehler beim Lesen der JSON-Datei.');
            }
        };
        reader.readAsText(file);
    });

    // Demo / Löschen
    document.getElementById('btn-load-demo').addEventListener('click', async () => {
        await loadDemoData();
        refreshUI();
        alert('Demo-Daten geladen.');
    });

    document.getElementById('btn-clear-data').addEventListener('click', async () => {
        if (confirm('Wirklich alle Daten löschen?')) {
            await db.clearAll();
            entries = [];
            refreshUI();
            alert('Alle Daten wurden gelöscht.');
        }
    });
}

// Berechnungslogik
function calculateEntryNet(entry) {
    if (entry.type !== 'Arbeit') return { netHours: 0, earnings: 0 };
    const [startH, startM] = entry.start.split(':').map(Number);
    const [endH, endM] = entry.end.split(':').map(Number);
    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    if (endMins < startMins) endMins += 24 * 60; // Über Mitternacht
    const netMins = (endMins - startMins) - Number(entry.breakMins);
    const netHours = Math.max(0, netMins / 60);
    return { netHours, earnings: netHours * hourlyWage };
}

// Dashboard aktualisieren
function updateDashboard() {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    document.getElementById('current-month-name').textContent = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('pdf-month').value = currentYearMonth;

    let monthMinutes = 0;
    let monthEarnings = 0;
    let monthDays = 0;

    const monthEntries = entries.filter(e => e.date.startsWith(currentYearMonth));
    monthEntries.forEach(e => {
        const res = calculateEntryNet(e);
        if (e.type === 'Arbeit') {
            monthMinutes += (res.netHours * 60);
            monthEarnings += res.earnings;
            monthDays++;
        }
    });

    document.getElementById('kpi-hours').textContent = `${(monthMinutes / 60).toFixed(2).replace('.', ',')} h`;
    document.getElementById('kpi-earnings').textContent = `${monthEarnings.toFixed(2).replace('.', ',')} €`;
    document.getElementById('kpi-days').textContent = monthDays;
    document.getElementById('kpi-wage').textContent = `${hourlyWage.toFixed(2).replace('.', ',')} €`;

    // Heutiger Eintrag auf Dashboard anzeigen
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntry = entries.find(e => e.date === todayStr);
    const todayContainer = document.getElementById('today-entry-details');

    if (todayEntry) {
        const res = calculateEntryNet(todayEntry);
        todayContainer.innerHTML = `
            <p><strong>Typ:</strong> ${todayEntry.type}</p>
            <p><strong>Zeit:</strong> ${todayEntry.start} - ${todayEntry.end} Uhr (${todayEntry.breakMins} Min Pause)</p>
            <p><strong>Netto:</strong> ${res.netHours.toFixed(2).replace('.', ',')} h | <strong>Verdienst:</strong> ${res.earnings.toFixed(2).replace('.', ',')} €</p>
            ${todayEntry.note ? `<p><strong>Notiz:</strong> ${todayEntry.note}</p>` : ''}
            <div class="button-group" style="margin-top: 0.5rem;">
                <button class="btn btn-sm btn-secondary" onclick="openModalForEdit(${todayEntry.id})">Bearbeiten</button>
            </div>
        `;
    } else {
        todayContainer.innerHTML = `<p class="text-muted">Keine Arbeitszeit für heute erfasst.</p>`;
    }

    // Letzte Buchungen
    const recentList = document.getElementById('recent-entries-list');
    const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (sorted.length === 0) {
        recentList.innerHTML = `<p class="text-muted">Keine Einträge vorhanden.</p>`;
    } else {
        recentList.innerHTML = sorted.map(e => {
            const res = calculateEntryNet(e);
            const [y, m, d] = e.date.split('-');
            return `
                <div class="entry-item">
                    <div class="entry-info">
                        <h4>${d}.${m}.${y} (${e.type})</h4>
                        <p>${e.type === 'Arbeit' ? `${e.start} -${e.end} Uhr | ${res.netHours.toFixed(2).replace('.', ',')} h \vert{}${res.earnings.toFixed(2).replace('.', ',')} €` : e.note || 'Keine Arbeitszeit'}</p>
                    </div>
                    <div class="entry-actions">
                        <button onclick="openModalForEdit(${e.id})">&#9998;</button>
                        <button onclick="deleteEntryId(${e.id})">&#128465;</button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Kalender-Ansicht
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Montag als 0
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Leere Felder am Anfang
    for (let i = 0; i < firstDayIndex; i++) {
        const div = document.createElement('div');
        div.className = 'cal-day empty';
        grid.appendChild(div);
    }

    // Tage des Monats
    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const div = document.createElement('div');
        div.className = 'cal-day';
        div.textContent = day;

        const entry = entries.find(e => e.date === dateStr);
        if (entry) {
            div.classList.add('has-entry');
        }
        if (dateStr === selectedCalendarDate) {
            div.classList.add('selected');
        }

        div.addEventListener('click', () => {
            selectedCalendarDate = dateStr;
            openModal(dateStr);
        });

        grid.appendChild(div);
    }
}

// Modal öffnen für Datum
function openModal(dateStr) {
    document.getElementById('entry-id').value = '';
    document.getElementById('input-date').value = dateStr;
    document.getElementById('input-start').value = '08:00';
    document.getElementById('input-end').value = '16:30';
    document.getElementById('input-break').value = '30';
    document.getElementById('input-type').value = 'Arbeit';
    document.getElementById('input-note').value = '';

    const existing = entries.find(e => e.date === dateStr);
    if (existing) {
        document.getElementById('entry-id').value = existing.id;
        document.getElementById('input-start').value = existing.start;
        document.getElementById('input-end').value = existing.end;
        document.getElementById('input-break').value = existing.breakMins;
        document.getElementById('input-type').value = existing.type;
        document.getElementById('input-note').value = existing.note || '';
        document.getElementById('modal-title').textContent = 'Buchung bearbeiten';
    } else {
        document.getElementById('modal-title').textContent = 'Arbeitszeit erfassen';
    }

    updateModalPreview();
    document.getElementById('entry-modal').classList.add('active');
}

async function openModalForEdit(id) {
    const entry = entries.find(e => e.id === id);
    if (entry) {
        openModal(entry.date);
    }
}

async function deleteEntryId(id) {
    if (confirm('Diesen Eintrag wirklich löschen?')) {
        await db.deleteEntry(id);
        entries = await db.getAllEntries();
        refreshUI();
    }
}

function updateModalPreview() {
    const start = document.getElementById('input-start').value;
    const end = document.getElementById('input-end').value;
    const breakMins = Number(document.getElementById('input-break').value);
    const type = document.getElementById('input-type').value;

    if (type !== 'Arbeit') {
        document.getElementById('preview-hours').textContent = '0,00 h';
        document.getElementById('preview-earnings').textContent = '0,00 €';
        return;
    }

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    if (endMins < startMins) endMins += 24 * 60;

    const netMins = (endMins - startMins) - breakMins;
    const netHours = Math.max(0, netMins / 60);
    const earnings = netHours * hourlyWage;

    document.getElementById('preview-hours').textContent = `${netHours.toFixed(2).replace('.', ',')} h`;
    document.getElementById('preview-earnings').textContent = `${earnings.toFixed(2).replace('.', ',')} €`;
}

// Statistiken & Diagramme
function updateStats() {
    let totalMins = 0;
    let totalEarnings = 0;
    let workDays = 0;

    entries.forEach(e => {
        const res = calculateEntryNet(e);
        if (e.type === 'Arbeit') {
            totalMins += (res.netHours * 60);
            totalEarnings += res.earnings;
            workDays++;
        }
    });

    document.getElementById('stats-total-hours').textContent = `${(totalMins / 60).toFixed(2).replace('.', ',')} h`;
    document.getElementById('stats-total-earnings').textContent = `${totalEarnings.toFixed(2).replace('.', ',')} €`;
    const avg = workDays > 0 ? (totalMins / 60) / workDays : 0;
    document.getElementById('stats-avg-hours').textContent = `${avg.toFixed(2).replace('.', ',')} h`;
}

function renderCharts() {
    // Letzte 6 Monate aggregieren
    const monthsData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });

        let mHours = 0;
        let mEarnings = 0;
        entries.filter(e => e.date.startsWith(ym) && e.type === 'Arbeit').forEach(e => {
            const res = calculateEntryNet(e);
            mHours += res.netHours;
            mEarnings += res.earnings;
        });

        monthsData.push({ label: monthLabel, hours: mHours, earnings: mEarnings });
    }

    const labels = monthsData.map(m => m.label);
    const hoursValues = monthsData.map(m => m.hours);
    const earningsValues = monthsData.map(m => m.earnings);

    // Stunden Chart
    const ctxHours = document.getElementById('hoursChart').getContext('2d');
    if (hoursChartInstance) hoursChartInstance.destroy();
    hoursChartInstance = new Chart(ctxHours, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Arbeitsstunden',
                data: hoursValues,
                backgroundColor: '#1b4d3e'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Verdienst Chart
    const ctxEarnings = document.getElementById('earningsChart').getContext('2d');
    if (earningsChartInstance) earningsChartInstance.destroy();
    earningsChartInstance = new Chart(ctxEarnings, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bruttoverdienst (€)',
                data: earningsValues,
                backgroundColor: '#4caf50'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// Beispieldaten für Oktober 2026
async function loadDemoData() {
    const demoEntries = [
        { date: "2026-10-01", start: "08:00", end: "16:30", breakMins: 30, type: "Arbeit", note: "Regulärer Tag" },
        { date: "2026-10-02", start: "08:00", end: "16:30", breakMins: 30, type: "Arbeit", note: "Regulärer Tag" },
        { date: "2026-10-05", start: "08:30", end: "17:00", breakMins: 30, type: "Arbeit", note: "Etwas später begonnen" },
        { date: "2026-10-06", start: "08:00", end: "16:30", breakMins: 45, type: "Arbeit", note: "Längere Pause" },
        { date: "2026-10-07", start: "08:00", end: "15:00", breakMins: 30, type: "Arbeit", note: "Früher Feierabend" },
        { date: "2026-10-08", start: "00:00", end: "00:00", breakMins: 0, type: "Krank", note: "Arztbesuch / Krank" }
    ];

    for (let entry of demoEntries) {
        await db.saveEntry(entry);
    }
    entries = await db.getAllEntries();
}
