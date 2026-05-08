// gantt-renderer.js — Modul terpisah untuk rendering Gantt Chart
// Module ini HANYA di-load saat user membuka laporan jadwal
// Dipisahkan karena ukurannya besar (~15KB+ kode CSS & rendering)

export const GanttRenderer = {
  /**
   * Render Gantt Chart untuk jadwal proyek
   * @param {Array} scheduleItems - Data jadwal
   * @param {Object} project - Data proyek (opsional)
   * @returns {string} HTML Gantt Chart
   */
  render(scheduleItems, project) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let allDates = [];
    scheduleItems.forEach(item => {
      if (item.start_date) allDates.push(new Date(item.start_date));
      if (item.end_date) allDates.push(new Date(item.end_date));
    });

    const currentYear = today.getFullYear();
    let chartStartDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date(currentYear, 0, 1);
    let chartEndDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date(currentYear, 11, 31);
    
    chartStartDate.setDate(chartStartDate.getDate() - 1);
    chartEndDate.setDate(chartEndDate.getDate() + 1);
    
    const totalDays = Math.ceil((chartEndDate - chartStartDate) / (1000 * 60 * 60 * 24)) + 1;
    
    // Generate array hari dengan informasi weekend
    const days = [];
    let currentDayDate = new Date(chartStartDate);
    while (currentDayDate <= chartEndDate) {
      const dayOfWeek = currentDayDate.getDay();
      days.push({
        date: new Date(currentDayDate),
        dayOfWeek: dayOfWeek,
        isSaturday: dayOfWeek === 6,
        isSunday: dayOfWeek === 0,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6
      });
      currentDayDate.setDate(currentDayDate.getDate() + 1);
    }
    
    // Generate array bulan
    const months = [];
    for (let d = new Date(chartStartDate); d <= chartEndDate; d.setMonth(d.getMonth() + 1)) {
      months.push({
        label: d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }),
        startDate: new Date(d.getFullYear(), d.getMonth(), 1),
        endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0)
      });
    }

    // Lebar label kolom kiri — fixed 28% dari lebar cetak A4
    // Tidak bergantung panjang karakter, biarkan CSS wrap teks
    const labelWidth = 220;

    return this._buildHTML(scheduleItems, days, months, totalDays, chartStartDate, today, labelWidth);
  },

  _buildHTML(scheduleItems, days, months, totalDays, chartStartDate, today, labelWidth) {
    const E = (window.UtilityService?.escapeHtml || ((s) => s));
    
    let html = this._getStyles(labelWidth);
    
    html += `<div class="gantt-wrapper">
      <table class="gantt-table">
        <thead>
          <tr>
            <th class="gantt-label-header" rowspan="2">Tahapan Pekerjaan</th>`;
    
    months.forEach(month => {
      const monthDays = days.filter(d => d.date >= month.startDate && d.date <= month.endDate);
      const colspan = monthDays.length;
      if (colspan > 0) {
        html += `<th class="gantt-month-header" colspan="${colspan}">${month.label}</th>`;
      }
    });
    
    html += `</tr></thead><tbody>`;

    scheduleItems.forEach((item, idx) => {
      const taskLabel = item.work_stage || item.work_process || 'Tahapan';
      
      let dateDisplay = '';
      if (item.start_date && item.end_date) {
        const startLabel = new Date(item.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const endLabel = new Date(item.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        dateDisplay = `${startLabel} — ${endLabel}`;
      } else {
        dateDisplay = 'Belum dijadwalkan';
      }
      
      let barClass = 'gantt-bar--upcoming';
      if (item.start_date && item.end_date) {
        const start = new Date(item.start_date); start.setHours(0,0,0,0);
        const end = new Date(item.end_date); end.setHours(0,0,0,0);
        if (end < today) barClass = 'gantt-bar--done';
        else if (start <= today && end >= today) barClass = 'gantt-bar--active';
      } else {
        barClass = 'gantt-bar--no-date';
      }

      const itemStart = item.start_date ? new Date(item.start_date) : null;
      const itemEnd = item.end_date ? new Date(item.end_date) : null;
      
      if (itemStart) itemStart.setHours(0,0,0,0);
      if (itemEnd) itemEnd.setHours(0,0,0,0);
      
      let leftPercent = 0;
      let widthPercent = 0;
      let barLabel = '';
      
      if (itemStart && itemEnd) {
        const startOffset = Math.max(0, (itemStart - chartStartDate) / (1000 * 60 * 60 * 24));
        const duration = (itemEnd - itemStart) / (1000 * 60 * 60 * 24) + 1;
        
        leftPercent = (startOffset / totalDays) * 100;
        widthPercent = Math.max(2, (duration / totalDays) * 100);
        
        const startLabel = itemStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const endLabel = itemEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        barLabel = `${startLabel} — ${endLabel}`;
      } else {
        leftPercent = 5;
        widthPercent = 90;
        barLabel = 'Belum dijadwalkan';
      }

      html += `<tr>`;
      html += `<td class="gantt-task-label" title="${E(taskLabel)} — ${dateDisplay}">
          <div class="gantt-task-label__name">${idx + 1}. ${E(taskLabel)}</div>
          <div class="gantt-task-label__date">${dateDisplay}</div>
        </td>`;

      html += `<td class="gantt-bar-cell" colspan="${days.length}" style="position:relative;">`;

      // Weekend lines
      days.forEach((day, dayIdx) => {
        const dayLeftPercent = (dayIdx / totalDays) * 100;
        if (day.isSaturday) {
          html += `<div class="gantt-weekend-line-saturday" style="left:${dayLeftPercent}%;width:${(1/totalDays)*100}%;"></div>`;
        }
        if (day.isSunday) {
          html += `<div class="gantt-weekend-line-sunday" style="left:${dayLeftPercent}%;width:${(1/totalDays)*100}%;"></div>`;
        }
      });

      // Today line
      const todayOffset = (today - chartStartDate) / (1000 * 60 * 60 * 24);
      if (todayOffset >= 0 && todayOffset <= totalDays) {
        html += `<div class="gantt-today-line" style="left:${(todayOffset / totalDays) * 100}%;"></div>`;
      }

      html += `<div class="gantt-bar ${barClass}" 
               style="left:${leftPercent}%; width:${widthPercent}%;"
               title="${itemStart && itemEnd ? itemStart.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}) + ' — ' + itemEnd.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}) : 'Belum dijadwalkan'}">
            ${barLabel}
          </div>
        </td>`;
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;

    // Legend
    html += this._getLegend();
    
    return html;
  },

  _getStyles(labelWidth) {
    return `<style>
      .gantt-wrapper {
        overflow: visible;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        margin-bottom: 16px;
        width: 100%;
      }
      .gantt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75rem;
        table-layout: fixed;
      }
      .gantt-table thead th {
        background: #f8fafc;
        padding: 8px 4px;
        border-bottom: 2px solid #e2e8f0;
        font-weight: 600;
        color: #475569;
        text-align: center;
        font-size: 0.68rem;
        position: sticky;
        top: 0;
        z-index: 4;
      }
      .gantt-table thead th.gantt-label-header {
        text-align: left;
        padding: 8px 12px;
        position: sticky;
        left: 0;
        background: #f8fafc;
        z-index: 6;
        width: ${labelWidth}px;
        min-width: ${labelWidth}px;
        max-width: ${labelWidth}px;
        border-right: 1px solid #e2e8f0;
      }
      .gantt-table thead th.gantt-month-header {
        font-size: 0.7rem;
        font-weight: 600;
        color: #334155;
        border-right: 1px solid #e2e8f0;
      }
      .gantt-table tbody td {
        padding: 0;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
        height: 48px;
        position: relative;
      }
      .gantt-table tbody tr:nth-child(even) td { background: #fafbfc; }
      .gantt-table tbody tr:hover td { background: #f1f5f9; }
      .gantt-task-label {
        padding: 6px 12px;
        white-space: normal;
        word-break: break-word;
        overflow: visible;
        border-right: 1px solid #e2e8f0;
        position: sticky;
        left: 0;
        background: #ffffff;
        z-index: 3;
        vertical-align: middle;
        width: ${labelWidth}px;
        min-width: ${labelWidth}px;
        max-width: ${labelWidth}px;
      }
      .gantt-table tbody tr:nth-child(even) .gantt-task-label { background: #fafbfc; }
      .gantt-table tbody tr:hover .gantt-task-label { background: #f1f5f9; }
      .gantt-task-label__name {
        font-weight: 600;
        color: #1e293b;
        font-size: 0.78rem;
      }
      .gantt-task-label__date {
        font-size: 0.65rem;
        color: #64748b;
        font-weight: 500;
        margin-top: 1px;
      }
      .gantt-bar-cell { position: relative; border-right: none; }
      .gantt-weekend-line-saturday {
        position: absolute; top: 0; bottom: 0; width: 2px;
        background: #fbbf24; z-index: 1; pointer-events: none; opacity: 0.7;
      }
      .gantt-weekend-line-sunday {
        position: absolute; top: 0; bottom: 0; width: 2px;
        background: #ef4444; z-index: 1; pointer-events: none; opacity: 0.6;
      }
      .gantt-bar {
        position: absolute; top: 12px; height: 22px; border-radius: 11px;
        cursor: pointer; z-index: 2; display: flex; align-items: center;
        padding: 0 10px; font-size: 0.6rem; font-weight: 600; color: white;
        white-space: nowrap; text-shadow: 0 1px 1px rgba(0,0,0,0.15);
        box-shadow: 0 1px 2px rgba(0,0,0,0.1); min-width: 24px;
        overflow: hidden; text-overflow: ellipsis; transition: all 0.15s ease;
      }
      .gantt-bar:hover { box-shadow: 0 3px 8px rgba(0,0,0,0.2); z-index: 5; }
      .gantt-bar--done { background: #10b981; border: 1px solid #059669; opacity: 0.85; }
      .gantt-bar--active { background: #f59e0b; border: 1px solid #d97706; opacity: 0.9; }
      .gantt-bar--upcoming { background: #3b82f6; border: 1px solid #2563eb; opacity: 0.85; }
      .gantt-bar--no-date {
        background: #f1f5f9; border: 1px dashed #cbd5e1; color: #64748b;
        text-shadow: none; opacity: 0.8; cursor: default; justify-content: center; font-weight: 500;
      }
      .gantt-today-line {
        position: absolute; top: 0; bottom: 0; width: 2px;
        background: #ef4444; z-index: 6; pointer-events: none; opacity: 0.8;
      }
      .gantt-today-line::after {
        content: ''; position: absolute; top: -2px; left: -4px;
        width: 10px; height: 10px; background: #ef4444; border-radius: 50%;
      }
      .gantt-legend {
        display: flex; gap: 16px; justify-content: center; margin-top: 12px;
        padding: 8px; background: #f8fafc; border-radius: 8px;
        font-size: 0.72rem; flex-wrap: wrap;
      }
      .gantt-legend__item { display: flex; align-items: center; gap: 6px; color: #64748b; }
      .gantt-legend__color { width: 20px; height: 12px; border-radius: 6px; display: inline-block; }
      
      @media (max-width: 768px) {
        .gantt-wrapper { border-radius: 8px; }
        .gantt-table thead th.gantt-label-header { width: 140px; min-width: 140px; max-width: 140px; }
        .gantt-task-label {
          width: 140px; min-width: 140px; max-width: 140px;
          font-size: 0.68rem; white-space: normal; word-break: break-word; overflow: visible;
        }
        .gantt-task-label__name { font-size: 0.68rem; }
        .gantt-task-label__date { font-size: 0.58rem; }
        .gantt-bar { font-size: 0.5rem; padding: 0 4px; height: 16px; top: 50%; transform: translateY(-50%); }
      }
      
      @media print {
        /* Wrapper: no scroll, full width, no shadow */
        .gantt-wrapper {
          overflow: visible !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 6px !important;
          box-shadow: none !important;
          width: 100% !important;
          page-break-inside: avoid;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Tabel: full width, ukuran font kecil agar muat A4 */
        .gantt-table {
          width: 100% !important;
          table-layout: fixed !important;
          font-size: 6pt !important;
          min-width: 0 !important;
          border-collapse: collapse !important;
        }

        /* Header bulan */
        .gantt-table thead th {
          padding: 4px 2px !important;
          font-size: 6pt !important;
          background: #1e293b !important;
          color: #f1f5f9 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Kolom label kiri — lebar 22% (landscape A4 lebih lebar, bar dapat ruang lebih) */
        .gantt-table thead th.gantt-label-header {
          width: 22% !important;
          min-width: 22% !important;
          max-width: 22% !important;
          font-size: 6pt !important;
          padding: 4px 6px !important;
          position: static !important;
        }

        /* Cell label setiap baris */
        .gantt-task-label {
          width: 22% !important;
          min-width: 22% !important;
          max-width: 22% !important;
          white-space: normal !important;
          word-break: break-word !important;
          overflow: visible !important;
          font-size: 6pt !important;
          padding: 4px 6px !important;
          position: static !important;
          vertical-align: middle !important;
        }

        .gantt-task-label__name {
          font-size: 6pt !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          line-height: 1.3 !important;
        }

        .gantt-task-label__date {
          font-size: 5pt !important;
          color: #475569 !important;
          line-height: 1.3 !important;
        }

        /* Baris tabel */
        .gantt-table tbody td {
          height: auto !important;
          min-height: 28px !important;
          padding: 2px 0 !important;
        }

        /* Bar chart */
        .gantt-bar {
          font-size: 5pt !important;
          height: 14px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          padding: 0 4px !important;
          border-radius: 3px !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Warna bar */
        .gantt-bar--done    { background: #10b981 !important; border-color: #059669 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .gantt-bar--active  { background: #f59e0b !important; border-color: #d97706 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .gantt-bar--upcoming{ background: #3b82f6 !important; border-color: #2563eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .gantt-bar--no-date { background: #f1f5f9 !important; color: #64748b !important;         -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        /* Garis weekend & today */
        .gantt-weekend-line-saturday,
        .gantt-weekend-line-sunday,
        .gantt-today-line {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Sembunyikan hover state */
        .gantt-table tbody tr:hover td { background: inherit !important; }
        .gantt-table tbody tr:hover .gantt-task-label { background: inherit !important; }

        /* Legend sudah no-print, pastikan tersembunyi */
        .gantt-legend { display: none !important; }
      }
    </style>`;
  },

  _getLegend() {
    return `<div class="gantt-legend no-print">
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#10b981;"></span> Selesai
      </div>
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#f59e0b;"></span> Berlangsung
      </div>
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#3b82f6;"></span> Mendatang
      </div>
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#f1f5f9; border:1px dashed #cbd5e1;"></span> Belum dijadwalkan
      </div>
      <div class="gantt-legend__item">
        <span style="display:inline-block;width:2px;height:12px;background:#fbbf24;border-radius:1px;"></span> Sabtu
      </div>
      <div class="gantt-legend__item">
        <span style="display:inline-block;width:2px;height:12px;background:#ef4444;border-radius:1px;"></span> Minggu
      </div>
      <div class="gantt-legend__item">
        <span style="display:inline-block;width:2px;height:12px;background:#ef4444;border-radius:1px;opacity:0.8;"></span> Hari ini
      </div>
    </div>`;
  }
};