// Echter PDF-Export mit jsPDF & autoTable
async function exportTimesheetPDF(yearMonth, employeeName, hourlyWage, entries) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const [year, month] = yearMonth.split("-");
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const monthName = monthNames[parseInt(month, 10) - 1];

    // Filter Einträge für diesen Monat
    const filtered = entries.filter(e => e.date.startsWith(`${year}-${month}`));
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Kopfzeile
    doc.setFontSize(18);
    doc.setTextColor(27, 77, 62);
    doc.text("Arbeitszeitnachweis", 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Zeitraum: ${monthName} ${year}`, 14, 28);
    if (employeeName) {
        doc.text(`Arbeitnehmer: ${employeeName}`, 14, 34);
    }
    doc.text(`Stundenlohn: ${hourlyWage.toFixed(2).replace('.', ',')} €`, 14, employeeName ? 40 : 34);

    let totalMinutes = 0;
    let totalEarnings = 0;
    let workDaysCount = 0;

    const tableData = filtered.map(e => {
        let netHours = 0;
        let earnings = 0;
        if (e.type === 'Arbeit') {
            const [startH, startM] = e.start.split(':').map(Number);
            const [endH, endM] = e.end.split(':').map(Number);
            let startMins = startH * 60 + startM;
            let endMins = endH * 60 + endM;
            if (endMins < startMins) endMins += 24 * 60; // Mitternacht
            const netMins = (endMins - startMins) - Number(e.breakMins);
            netHours = Math.max(0, netMins / 60);
            earnings = netHours * hourlyWage;
            totalMinutes += Math.max(0, netMins);
            totalEarnings += earnings;
            workDaysCount++;
        }

        // Datum formatieren JJJJ-MM-TT -> TT.MM.JJJJ
        const [y, m, d] = e.date.split('-');
        const formattedDate = `${d}.${m}.${y}`;

        return [
            formattedDate,
            e.type === 'Arbeit' ? e.start : '-',
            e.type === 'Arbeit' ? e.end : '-',
            e.type === 'Arbeit' ? `${e.breakMins} Min` : '-',
            e.type === 'Arbeit' ? `${netHours.toFixed(2).replace('.', ',')} h` : e.type,
            e.type === 'Arbeit' ? `${earnings.toFixed(2).replace('.', ',')} €` : '-',
            e.note || ''
        ];
    });

    doc.autoTable({
        startY: employeeName ? 46 : 40,
        head: [['Datum', 'Beginn', 'Ende', 'Pause', 'Netto', 'Verdienst', 'Notiz']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [27, 77, 62] },
        styles: { fontSize: 9 }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    const totalHoursNum = totalMinutes / 60;

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Gesamte Arbeitstage: ${workDaysCount}`, 14, finalY);
    doc.text(`Summe Nettoarbeitsstunden: ${totalHoursNum.toFixed(2).replace('.', ',')} h`, 14, finalY + 6);
    doc.text(`Gesamtverdienst (brutto): ${totalEarnings.toFixed(2).replace('.', ',')} €`, 14, finalY + 12);

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')} via Zeiterfassungs-WebApp`, 14, finalY + 22);

    doc.save(`Stundenzettel_${year}-${month}.pdf`);
}