(function () {
  'use strict';

  // -------------------------------------------------------------- Storage --
  const STORAGE_KEY = 'renteasy.v1';
  const emptyState = () => ({
    properties: [],
    tenants: [],
    payments: [],
    maintenance: [],
    agreements: []
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      const base = emptyState();
      return Object.assign(base, parsed);
    } catch (e) {
      return emptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const state = loadState();

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ---------------------------------------------------------- Formatters --
  const money = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };
  const moneyExact = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const fmtMonth = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // ----------------------------------------------------- Lookup helpers --
  const propertyById = (id) => state.properties.find(p => p.id === id);
  const tenantById = (id) => state.tenants.find(t => t.id === id);
  const tenantsForProperty = (pid) => state.tenants.filter(t => t.propertyId === pid);
  const propertyLabel = (p) => p ? `${p.address}, ${p.city}, ${p.state} ${p.zip}` : '(deleted property)';
  const tenantLabel = (t) => {
    if (!t) return '(deleted tenant)';
    const p = propertyById(t.propertyId);
    return `${t.name} — ${p ? p.address : 'no property'}`;
  };

  // -------------------------------------------------- Channel deep links --
  function whatsappLink(whatsapp, message) {
    const digits = String(whatsapp || '').replace(/[^\d]/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }
  function emailLink(to, subject, body) {
    if (!to) return null;
    const params = [];
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (body) params.push('body=' + encodeURIComponent(body));
    return `mailto:${to}` + (params.length ? '?' + params.join('&') : '');
  }
  function printDocument(title, body) {
    const area = document.getElementById('print-area');
    const safeTitle = String(title || 'Document').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const safeBody = String(body || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    area.innerHTML =
      '<h1>' + safeTitle + '</h1>' +
      '<div class="doc-meta">RentEasy &middot; ' + fmtDate(new Date().toISOString()) + '</div>' +
      '<pre>' + safeBody + '</pre>';
    window.print();
  }

  // ------------------------------------------- Channel-button row builder --
  function buildChannelButtons(container, opts) {
    // opts: { text, copyOnly?, whatsappTo, emailTo, emailSubject, printTitle, whatsappMessage, emailBody }
    container.innerHTML = '';
    const text = opts.text || '';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-channel';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard');
      } catch (e) {
        // Fallback: select the document text and prompt manual copy
        toast('Copy failed — select the text manually');
      }
    });
    container.appendChild(copyBtn);

    if (opts.whatsappTo !== undefined) {
      const link = whatsappLink(opts.whatsappTo, opts.whatsappMessage || text);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-channel whatsapp';
      btn.textContent = 'Send via WhatsApp';
      if (!link) {
        btn.disabled = true;
        btn.title = 'No WhatsApp number on file for this tenant';
      } else {
        btn.addEventListener('click', () => window.open(link, '_blank', 'noopener'));
      }
      container.appendChild(btn);
    }

    if (opts.emailTo !== undefined) {
      const link = emailLink(opts.emailTo, opts.emailSubject || '', opts.emailBody || text);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-channel email';
      btn.textContent = 'Send via Email';
      if (!link) {
        btn.disabled = true;
        btn.title = 'No email on file for this tenant';
      } else {
        btn.addEventListener('click', () => { window.location.href = link; });
      }
      container.appendChild(btn);
    }

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'btn-channel';
    printBtn.textContent = 'Print / Save as PDF';
    printBtn.addEventListener('click', () => printDocument(opts.printTitle || 'Document', text));
    container.appendChild(printBtn);
  }

  // ---------------------------------------------------------------- UI --
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function setActiveView(name) {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('hidden', v.dataset.view !== name);
    });
    if (name === 'dashboard') renderDashboard();
  }

  // ----------------------------------------------------- Property views --
  function renderPropertyDropdowns() {
    const opts = state.properties.map(p =>
      `<option value="${p.id}">${propertyLabel(p)}</option>`
    ).join('');
    const placeholder = '<option value="">Select a property</option>';
    ['tenant-property-select', 'agreement-property-select', 'maintenance-property-select'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const current = el.value;
      el.innerHTML = placeholder + opts;
      if (current) el.value = current;
    });
  }

  function renderTenantDropdowns() {
    const opts = state.tenants.map(t =>
      `<option value="${t.id}">${tenantLabel(t)}</option>`
    ).join('');
    const placeholder = '<option value="">Select a tenant</option>';
    ['payment-tenant-select', 'reminder-tenant-select', 'demand-tenant-select'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const current = el.value;
      el.innerHTML = placeholder + opts;
      if (current) el.value = current;
    });
  }

  function renderPropertyList() {
    const list = document.getElementById('property-list');
    if (!state.properties.length) {
      list.innerHTML = '<div class="empty">No properties yet. Add one above to get started.</div>';
      return;
    }
    list.innerHTML = state.properties.map(p => {
      const tenants = tenantsForProperty(p.id);
      return `
        <div class="list-item">
          <div>
            <div><strong>${p.address}</strong></div>
            <div class="meta">${p.city}, ${p.state} ${p.zip} &middot; ${p.type} &middot; ${p.bedrooms} BR</div>
            <div class="meta">Rent ${money(p.rent)}/mo &middot; ${tenants.length} tenant${tenants.length === 1 ? '' : 's'}</div>
          </div>
          <div class="actions">
            <button class="btn-danger" data-action="delete-property" data-id="${p.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderTenantList() {
    const list = document.getElementById('tenant-list');
    if (!state.tenants.length) {
      list.innerHTML = '<div class="empty">No tenants yet.</div>';
      return;
    }
    list.innerHTML = state.tenants.map(t => {
      const p = propertyById(t.propertyId);
      const auto = t.autoDebit === 'on'
        ? '<span class="badge ok">Auto-debit</span>'
        : '<span class="badge muted">Reminders only</span>';
      return `
        <div class="list-item">
          <div>
            <div><strong>${t.name}</strong> ${auto}</div>
            <div class="meta">${p ? p.address : '(deleted property)'} &middot; Lease ${fmtDate(t.leaseStart)} → ${fmtDate(t.leaseEnd)}</div>
            <div class="meta">WhatsApp ${t.whatsapp || '—'} &middot; ${t.email || '—'} &middot; Due day ${t.dueDay}</div>
          </div>
          <div class="actions">
            <button class="btn-danger" data-action="delete-tenant" data-id="${t.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderPaymentHistory() {
    const list = document.getElementById('payment-history');
    if (!state.payments.length) {
      list.innerHTML = '<div class="empty">No payments recorded yet.</div>';
      return;
    }
    const sorted = state.payments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    list.innerHTML = sorted.map(p => {
      const t = tenantById(p.tenantId);
      return `
        <div class="list-item">
          <div>
            <div><strong>${moneyExact(p.amount)}</strong> &middot; ${t ? t.name : '(deleted tenant)'}</div>
            <div class="meta">For ${fmtMonth(p.period)} &middot; Received ${fmtDate(p.date)} via ${p.method}</div>
          </div>
          <div class="actions">
            <button class="btn-danger" data-action="delete-payment" data-id="${p.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderMaintenanceList() {
    const list = document.getElementById('maintenance-list');
    if (!state.maintenance.length) {
      list.innerHTML = '<div class="empty">No maintenance items yet.</div>';
      return;
    }
    const sorted = state.maintenance.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    list.innerHTML = sorted.map(m => {
      const p = propertyById(m.propertyId);
      return `
        <div class="list-item">
          <div>
            <div><strong>${m.description}</strong> <span class="badge muted">${m.category}</span></div>
            <div class="meta">${p ? p.address : '(deleted property)'} &middot; ${fmtDate(m.date)} &middot; ${m.vendor || 'No vendor'}</div>
            <div class="meta">Cost: ${moneyExact(m.cost)}</div>
          </div>
          <div class="actions">
            <button class="btn-danger" data-action="delete-maintenance" data-id="${m.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderAgreementList() {
    const list = document.getElementById('agreement-list');
    if (!state.agreements.length) {
      list.innerHTML = '<div class="empty">No saved agreements yet.</div>';
      return;
    }
    const sorted = state.agreements.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    list.innerHTML = sorted.map(a => {
      const p = propertyById(a.propertyId);
      return `
        <div class="list-item">
          <div>
            <div><strong>${a.tenantName}</strong> &middot; ${p ? p.address : '(deleted property)'}</div>
            <div class="meta">${fmtDate(a.start)} → ${fmtDate(a.end)} &middot; ${moneyExact(a.rent)}/mo &middot; ${moneyExact(a.deposit)} deposit</div>
          </div>
          <div class="actions">
            <button class="btn-ghost" data-action="view-agreement" data-id="${a.id}">View</button>
            <button class="btn-danger" data-action="delete-agreement" data-id="${a.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  // ------------------------------------------------ Dashboard analytics --
  function ytdRevenue() {
    const year = new Date().getFullYear();
    return state.payments
      .filter(p => p.date && new Date(p.date).getFullYear() === year)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }
  function ytdExpenses() {
    const year = new Date().getFullYear();
    return state.maintenance
      .filter(m => m.date && new Date(m.date).getFullYear() === year)
      .reduce((s, m) => s + Number(m.cost || 0), 0);
  }
  function outstandingRentForTenant(t) {
    const now = new Date();
    const start = t.leaseStart ? new Date(t.leaseStart) : null;
    const end = t.leaseEnd ? new Date(t.leaseEnd) : null;
    if (!start) return 0;
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const periodStart = start > yearStart ? start : yearStart;
    const periodEnd = end && end < now ? end : now;
    if (periodEnd < periodStart) return 0;
    const months = Math.max(0,
      (periodEnd.getFullYear() - periodStart.getFullYear()) * 12
      + (periodEnd.getMonth() - periodStart.getMonth())
      + 1
    );
    const p = propertyById(t.propertyId);
    const rent = p ? Number(p.rent || 0) : 0;
    const expectedRent = months * rent;
    const paid = state.payments
      .filter(pmt => pmt.tenantId === t.id && pmt.date && new Date(pmt.date).getFullYear() === now.getFullYear())
      .reduce((s, pmt) => s + Number(pmt.amount || 0), 0);
    return Math.max(0, expectedRent - paid);
  }
  function totalOutstanding() {
    return state.tenants.reduce((s, t) => s + outstandingRentForTenant(t), 0);
  }
  function overdueCount() {
    return state.tenants.filter(t => outstandingRentForTenant(t) > 0).length;
  }

  function monthlyPnL(months) {
    const now = new Date();
    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short' }), revenue: 0, expenses: 0 });
    }
    state.payments.forEach(p => {
      if (!p.date) return;
      const d = new Date(p.date);
      const b = buckets.find(b => b.y === d.getFullYear() && b.m === d.getMonth());
      if (b) b.revenue += Number(p.amount || 0);
    });
    state.maintenance.forEach(m => {
      if (!m.date) return;
      const d = new Date(m.date);
      const b = buckets.find(b => b.y === d.getFullYear() && b.m === d.getMonth());
      if (b) b.expenses += Number(m.cost || 0);
    });
    return buckets;
  }

  function drawPnLChart() {
    const canvas = document.getElementById('pnl-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const data = monthlyPnL(6);
    const max = Math.max(100, ...data.map(d => Math.max(d.revenue, d.expenses)));
    const padL = 50, padR = 20, padT = 20, padB = 35;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const groupW = plotW / data.length;
    const barW = (groupW - 12) / 2;

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
    }
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#8b9cb3';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const value = max * (1 - i / 4);
      const y = padT + (plotH * i) / 4;
      ctx.fillText('$' + Math.round(value).toLocaleString(), padL - 6, y + 3);
    }

    // Bars
    data.forEach((d, idx) => {
      const groupX = padL + groupW * idx + 6;
      const revH = (d.revenue / max) * plotH;
      const expH = (d.expenses / max) * plotH;

      ctx.fillStyle = '#7bc96f';
      ctx.fillRect(groupX, padT + plotH - revH, barW, revH);

      ctx.fillStyle = '#f87171';
      ctx.fillRect(groupX + barW + 2, padT + plotH - expH, barW, expH);

      ctx.fillStyle = '#8b9cb3';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, groupX + barW + 1, H - padB + 16);
    });

    // Profit polyline
    ctx.strokeStyle = '#5b9fd4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const profit = d.revenue - d.expenses;
      const groupX = padL + groupW * idx + groupW / 2;
      const ratio = max ? Math.max(-1, Math.min(1, profit / max)) : 0;
      const y = padT + plotH / 2 - (ratio * plotH) / 2;
      if (idx === 0) ctx.moveTo(groupX, y);
      else ctx.lineTo(groupX, y);
    });
    ctx.stroke();

    // Profit dots
    ctx.fillStyle = '#5b9fd4';
    data.forEach((d, idx) => {
      const profit = d.revenue - d.expenses;
      const groupX = padL + groupW * idx + groupW / 2;
      const ratio = max ? Math.max(-1, Math.min(1, profit / max)) : 0;
      const y = padT + plotH / 2 - (ratio * plotH) / 2;
      ctx.beginPath();
      ctx.arc(groupX, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderPropertyPerformance() {
    const wrap = document.getElementById('property-performance');
    if (!state.properties.length) {
      wrap.innerHTML = '<div class="empty">Add a property to see performance.</div>';
      return;
    }
    const year = new Date().getFullYear();
    wrap.innerHTML = state.properties.map(p => {
      const tenants = tenantsForProperty(p.id);
      const tenantIds = new Set(tenants.map(t => t.id));
      const revenue = state.payments
        .filter(pmt => tenantIds.has(pmt.tenantId) && pmt.date && new Date(pmt.date).getFullYear() === year)
        .reduce((s, pmt) => s + Number(pmt.amount || 0), 0);
      const expenses = state.maintenance
        .filter(m => m.propertyId === p.id && m.date && new Date(m.date).getFullYear() === year)
        .reduce((s, m) => s + Number(m.cost || 0), 0);
      const profit = revenue - expenses;
      return `
        <div class="perf-row">
          <div>
            <div><strong>${p.address}</strong></div>
            <div class="meta">${p.city}, ${p.state}</div>
          </div>
          <div><div class="label">Revenue</div><div>${money(revenue)}</div></div>
          <div><div class="label">Expenses</div><div>${money(expenses)}</div></div>
          <div><div class="label">Profit</div><div style="color:${profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${money(profit)}</div></div>
        </div>`;
    }).join('');
  }

  function renderUpcomingPayments() {
    const wrap = document.getElementById('upcoming-payments');
    if (!state.tenants.length) {
      wrap.innerHTML = '<div class="empty">Add a tenant to see upcoming payments.</div>';
      return;
    }
    const now = new Date();
    const rows = state.tenants.map(t => {
      const p = propertyById(t.propertyId);
      const rent = p ? Number(p.rent || 0) : 0;
      const dueDay = Number(t.dueDay || 1);
      const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
      const nextDue = thisMonthDue >= now ? thisMonthDue : new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
      const daysUntil = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
      const outstanding = outstandingRentForTenant(t);
      let badge;
      if (outstanding > 0) badge = '<span class="badge danger">Overdue</span>';
      else if (daysUntil <= 5) badge = '<span class="badge warn">Due in ' + daysUntil + 'd</span>';
      else badge = '<span class="badge ok">Up to date</span>';
      return { t, p, rent, nextDue, daysUntil, outstanding, badge };
    }).sort((a, b) => (b.outstanding > 0 ? 1 : 0) - (a.outstanding > 0 ? 1 : 0) || a.daysUntil - b.daysUntil);

    wrap.innerHTML = rows.map(r => `
      <div class="list-item">
        <div>
          <div><strong>${r.t.name}</strong> ${r.badge}</div>
          <div class="meta">${r.p ? r.p.address : '(no property)'} &middot; Next due ${fmtDate(r.nextDue.toISOString())}</div>
          <div class="meta">Outstanding: ${moneyExact(r.outstanding)} &middot; Monthly rent ${moneyExact(r.rent)}</div>
        </div>
        <div class="actions"></div>
      </div>`).join('');
  }

  function renderDashboard() {
    const rev = ytdRevenue();
    const exp = ytdExpenses();
    const profit = rev - exp;
    const outstanding = totalOutstanding();
    document.getElementById('stat-revenue').textContent = money(rev);
    document.getElementById('stat-expenses').textContent = money(exp);
    document.getElementById('stat-profit').textContent = money(profit);
    document.getElementById('stat-outstanding').textContent = money(outstanding);
    const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;
    document.getElementById('stat-margin').textContent = `Margin: ${margin}%`;
    document.getElementById('stat-overdue-count').textContent = `${overdueCount()} tenant${overdueCount() === 1 ? '' : 's'} with balance`;
    drawPnLChart();
    renderPropertyPerformance();
    renderUpcomingPayments();
  }

  // ------------------------------------------ Reminders / messages text --
  function buildReminderMessage(tenant, type) {
    const p = propertyById(tenant.propertyId);
    const rent = p ? moneyExact(p.rent) : '$—';
    const addr = p ? p.address : '(your unit)';
    const dueDay = Number(tenant.dueDay || 1);
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
    const dueLabel = fmtDate(dueDate.toISOString());

    const auto = tenant.autoDebit === 'on'
      ? '\n\nNote: Your account is enrolled in auto-debit. The amount above will be drawn automatically on the due date — no action needed unless you want to change the payment method.'
      : '';

    if (type === 'upcoming') {
      return `Hi ${tenant.name},\n\nFriendly reminder that rent of ${rent} for ${addr} is due on ${dueLabel} (in 5 days).${auto}\n\nThank you,\nRentEasy on behalf of your landlord`;
    }
    if (type === 'due') {
      return `Hi ${tenant.name},\n\nYour rent of ${rent} for ${addr} is due today, ${dueLabel}.${auto}\n\nPlease let us know once payment has been sent.\n\nThank you,\nRentEasy on behalf of your landlord`;
    }
    // late
    return `Hi ${tenant.name},\n\nWe haven't yet received the ${rent} rent payment for ${addr} that was due on ${dueLabel}. Please send payment as soon as possible to avoid late fees and further notices.${auto}\n\nIf payment has already been sent, please reply with the date and method so we can confirm.\n\nThank you,\nRentEasy on behalf of your landlord`;
  }

  function reminderSubject(tenant, type) {
    const p = propertyById(tenant.propertyId);
    const addr = p ? p.address : 'your unit';
    if (type === 'upcoming') return `Upcoming rent reminder — ${addr}`;
    if (type === 'due') return `Rent due today — ${addr}`;
    return `Overdue rent notice — ${addr}`;
  }

  // ------------------------------------------------ Demand letter text --
  function buildDemandLetter(tenant, opts) {
    const p = propertyById(tenant.propertyId);
    const today = fmtDate(new Date().toISOString());
    const addr = p ? `${p.address}, ${p.city}, ${p.state} ${p.zip}` : '(property address)';
    const stateLine = p ? `pursuant to the laws of the State of ${p.state}` : '';
    return [
      `NOTICE TO PAY RENT OR QUIT`,
      ``,
      `Date: ${today}`,
      `To: ${tenant.name}`,
      `Premises: ${addr}`,
      ``,
      `Dear ${tenant.name},`,
      ``,
      `You are hereby notified that rent in the amount of ${moneyExact(opts.amount)} is now due and owing on the above-described premises. As of today, this amount is ${opts.daysLate} day(s) past due.`,
      ``,
      `You are required, within ${opts.window} day(s) of receipt of this notice, to either:`,
      `  (a) pay the full amount of rent owed, ${moneyExact(opts.amount)}; or`,
      `  (b) deliver up possession of the premises to the undersigned landlord.`,
      ``,
      `Failure to do one of the above within the ${opts.window}-day period will result in legal proceedings being instituted against you to recover possession of the premises, the rent owed, court costs, and attorney's fees ${stateLine}.`,
      ``,
      `Payment may be made to the landlord at the contact information provided in your tenancy agreement.`,
      ``,
      `Sincerely,`,
      ``,
      ``,
      `${opts.landlordName}`,
      `Landlord`,
    ].join('\n');
  }

  // ------------------------------------------------ Tenancy agreement --
  const STATE_CLAUSES = {
    CA: 'California Security Deposit Cap. Pursuant to California Civil Code §1950.5, the security deposit shall not exceed two (2) months\' rent for unfurnished units or three (3) months\' rent for furnished units. The Landlord shall return the deposit, less lawful deductions, within 21 days of the Tenant vacating the premises.',
    NY: 'New York Disclosures. Pursuant to New York Real Property Law §238-a, the security deposit shall not exceed one (1) month\'s rent. If the unit is rent-stabilized, the Tenant\'s rights under the Rent Stabilization Code apply and supersede any conflicting term herein.',
    FL: 'Florida Radon Gas Disclosure. As required by Florida Statute §404.056(5): "Radon is a naturally occurring radioactive gas that, when it has accumulated in a building in sufficient quantities, may present health risks to persons who are exposed to it over time. Levels of radon that exceed federal and state guidelines have been found in buildings in Florida. Additional information regarding radon and radon testing may be obtained from your county health department."',
    TX: 'Texas Late Fee. Pursuant to Texas Property Code §92.019, late fees are reasonable as long as they do not exceed 12% of the monthly rent for properties with four or fewer units, or 10% for larger properties, and are not assessed until rent is at least two (2) days past due.',
    GA: 'Georgia Security Deposit. Pursuant to O.C.G.A. §44-7-30 et seq., the security deposit shall be held in a separate escrow account and an itemized list of the condition of the premises shall be furnished to the Tenant prior to move-in.',
    IL: 'Illinois Disclosures. Pursuant to the Illinois Radon Awareness Act (420 ILCS 46/), the Landlord discloses that radon is a naturally-occurring radioactive gas that may cause lung cancer and a known result of radon testing on the premises (if any) is provided to the Tenant.',
    WA: 'Washington State Notices. Pursuant to RCW 59.18, a 14-day notice to pay or vacate is required prior to eviction for non-payment, and the security deposit shall be held in a trust account at a financial institution located in Washington.',
    CO: 'Colorado Bed Bug Disclosure. Pursuant to C.R.S. §38-12-1004, the Landlord discloses that the premises has not, within the previous eight (8) months, contained a known bed bug infestation, unless otherwise noted in writing as an addendum to this Agreement.',
    MA: 'Massachusetts Security Deposit. Pursuant to M.G.L. c. 186, §15B, the security deposit shall be held in a separate, interest-bearing account in a Massachusetts bank, and a receipt of deposit shall be furnished to the Tenant within 30 days.',
    OR: 'Oregon Smoking Policy Disclosure. Pursuant to ORS 90.220(7), the Landlord discloses the smoking policy of the premises in writing as part of this Agreement.',
  };
  function stateSpecificClause(stateCode) {
    return STATE_CLAUSES[stateCode] ||
      `State-Specific Provisions. This Agreement shall be governed by and construed in accordance with the laws of the State of ${stateCode}. Both parties acknowledge they are responsible for compliance with all applicable state and local landlord-tenant statutes.`;
  }

  function buildAgreementText(opts) {
    const p = propertyById(opts.propertyId);
    const addr = p ? `${p.address}, ${p.city}, ${p.state} ${p.zip}` : '(address)';
    const stateCode = p ? p.state : '';
    const clause = stateSpecificClause(stateCode);
    const today = fmtDate(new Date().toISOString());

    return [
      `RESIDENTIAL TENANCY AGREEMENT`,
      ``,
      `This Residential Tenancy Agreement ("Agreement") is entered into on ${today} by and between:`,
      ``,
      `LANDLORD: ${opts.landlordName}`,
      `TENANT:   ${opts.tenantName}`,
      `PREMISES: ${addr}`,
      ``,
      `1. TERM`,
      `   The term of this Agreement shall begin on ${fmtDate(opts.start)} and end on ${fmtDate(opts.end)}, unless terminated earlier as permitted herein.`,
      ``,
      `2. RENT`,
      `   Tenant agrees to pay rent in the amount of ${moneyExact(opts.rent)} per month, payable in advance on the first day of each calendar month.`,
      ``,
      `3. SECURITY DEPOSIT`,
      `   Tenant has paid to Landlord a security deposit of ${moneyExact(opts.deposit)}, to be held by Landlord as security for the faithful performance by Tenant of the terms of this Agreement.`,
      ``,
      `4. LATE FEE`,
      `   Rent received more than five (5) days after the due date shall be subject to a late fee of ${moneyExact(opts.lateFee)}.`,
      ``,
      `5. PETS`,
      `   Pets are ${opts.pets === 'Yes' ? 'permitted on the premises subject to a separate Pet Addendum' : 'NOT permitted on the premises without prior written consent of the Landlord'}.`,
      ``,
      `6. USE OF PREMISES`,
      `   The premises shall be used solely as a private residence by the Tenant and the Tenant's immediate family. Any other use is prohibited without prior written consent.`,
      ``,
      `7. MAINTENANCE AND REPAIRS`,
      `   Tenant shall keep the premises in a clean and sanitary condition, and shall promptly notify Landlord of any needed repairs. Landlord is responsible for major structural and system repairs except where caused by Tenant's negligence.`,
      ``,
      `8. ENTRY BY LANDLORD`,
      `   Landlord may enter the premises at reasonable times and with reasonable notice (typically at least 24 hours, unless otherwise required by state law) for inspection, maintenance, or to show the premises to prospective tenants or buyers.`,
      ``,
      `9. STATE-SPECIFIC PROVISIONS (${stateCode || '—'})`,
      `   ${clause}`,
      ``,
      `10. ENTIRE AGREEMENT`,
      `    This Agreement constitutes the entire agreement between the parties and supersedes any prior understandings or agreements, oral or written.`,
      ``,
      `IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.`,
      ``,
      `__________________________          __________________________`,
      `${opts.landlordName} (Landlord)        ${opts.tenantName} (Tenant)`,
      ``,
      `Date: ____________________          Date: ____________________`,
    ].join('\n');
  }

  function buildAgreementSummary(opts) {
    const p = propertyById(opts.propertyId);
    const addr = p ? `${p.address}, ${p.city}, ${p.state}` : '(address)';
    return [
      `Hi ${opts.tenantName},`,
      ``,
      `Here is a summary of your tenancy agreement for ${addr}:`,
      `  • Term: ${fmtDate(opts.start)} → ${fmtDate(opts.end)}`,
      `  • Monthly rent: ${moneyExact(opts.rent)}`,
      `  • Security deposit: ${moneyExact(opts.deposit)}`,
      `  • Late fee (after 5 days): ${moneyExact(opts.lateFee)}`,
      `  • Pets: ${opts.pets}`,
      ``,
      `The full signed agreement will be shared with you separately for your records.`,
      ``,
      `Thank you,`,
      `${opts.landlordName}`,
    ].join('\n');
  }

  // ------------------------------------------------ Form submissions --

  function bindForms() {
    document.getElementById('property-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.properties.push({
        id: uid(),
        address: f.get('address').trim(),
        city: f.get('city').trim(),
        state: f.get('state'),
        zip: f.get('zip').trim(),
        type: f.get('type'),
        bedrooms: Number(f.get('bedrooms')) || 0,
        rent: Number(f.get('rent')) || 0,
        purchase: Number(f.get('purchase')) || 0,
        createdAt: new Date().toISOString()
      });
      saveState();
      e.target.reset();
      renderAll();
      toast('Property added');
    });

    document.getElementById('tenant-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.tenants.push({
        id: uid(),
        propertyId: f.get('propertyId'),
        name: f.get('name').trim(),
        whatsapp: f.get('whatsapp').trim(),
        email: f.get('email').trim(),
        leaseStart: f.get('leaseStart'),
        leaseEnd: f.get('leaseEnd'),
        dueDay: Number(f.get('dueDay')) || 1,
        autoDebit: f.get('autoDebit'),
        createdAt: new Date().toISOString()
      });
      saveState();
      e.target.reset();
      renderAll();
      toast('Tenant added');
    });

    document.getElementById('payment-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.payments.push({
        id: uid(),
        tenantId: f.get('tenantId'),
        amount: Number(f.get('amount')) || 0,
        date: f.get('date'),
        method: f.get('method'),
        period: f.get('period'),
        createdAt: new Date().toISOString()
      });
      saveState();
      e.target.reset();
      renderAll();
      toast('Payment recorded');
    });

    document.getElementById('reminder-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const tenant = tenantById(f.get('tenantId'));
      if (!tenant) { toast('Select a tenant'); return; }
      const type = f.get('type');
      const text = buildReminderMessage(tenant, type);
      document.getElementById('reminder-output').classList.remove('hidden');
      document.getElementById('reminder-text').textContent = text;
      buildChannelButtons(document.getElementById('reminder-actions'), {
        text,
        whatsappTo: tenant.whatsapp,
        emailTo: tenant.email,
        emailSubject: reminderSubject(tenant, type),
        printTitle: 'Rent Reminder — ' + tenant.name,
      });
    });

    document.getElementById('maintenance-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.maintenance.push({
        id: uid(),
        propertyId: f.get('propertyId'),
        date: f.get('date'),
        category: f.get('category'),
        description: f.get('description').trim(),
        cost: Number(f.get('cost')) || 0,
        vendor: f.get('vendor').trim(),
        createdAt: new Date().toISOString()
      });
      saveState();
      e.target.reset();
      renderAll();
      toast('Maintenance item added');
    });

    document.getElementById('agreement-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const opts = {
        propertyId: f.get('propertyId'),
        tenantName: f.get('tenantName').trim(),
        landlordName: f.get('landlordName').trim(),
        start: f.get('start'),
        end: f.get('end'),
        rent: Number(f.get('rent')) || 0,
        deposit: Number(f.get('deposit')) || 0,
        pets: f.get('pets'),
        lateFee: Number(f.get('lateFee')) || 0,
      };
      const text = buildAgreementText(opts);
      const summary = buildAgreementSummary(opts);
      const record = Object.assign({ id: uid(), text, createdAt: new Date().toISOString() }, opts);
      state.agreements.push(record);
      saveState();
      showAgreement(record);
      renderAll();
      toast('Agreement generated');
    });

    document.getElementById('demand-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const tenant = tenantById(f.get('tenantId'));
      if (!tenant) { toast('Select a tenant'); return; }
      const opts = {
        amount: Number(f.get('amount')) || 0,
        daysLate: Number(f.get('daysLate')) || 1,
        window: Number(f.get('window')) || 7,
        landlordName: f.get('landlordName').trim(),
      };
      const text = buildDemandLetter(tenant, opts);
      document.getElementById('demand-output').classList.remove('hidden');
      document.getElementById('demand-text').textContent = text;
      buildChannelButtons(document.getElementById('demand-actions'), {
        text,
        whatsappTo: tenant.whatsapp,
        emailTo: tenant.email,
        emailSubject: 'Notice to Pay Rent or Quit',
        printTitle: 'Demand Letter — ' + tenant.name,
      });
    });
  }

  function showAgreement(record) {
    const tenant = state.tenants.find(t => t.name === record.tenantName);
    document.getElementById('agreement-output').classList.remove('hidden');
    document.getElementById('agreement-text').textContent = record.text;
    const summary = buildAgreementSummary(record);
    buildChannelButtons(document.getElementById('agreement-actions'), {
      text: record.text,
      whatsappTo: tenant ? tenant.whatsapp : '',
      whatsappMessage: summary,
      emailTo: tenant ? tenant.email : '',
      emailSubject: 'Your tenancy agreement summary',
      emailBody: summary,
      printTitle: 'Tenancy Agreement — ' + record.tenantName,
    });
  }

  // -------------------------------------------------------- Delete actions --
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'delete-property') {
      if (!confirm('Delete this property? Linked tenants will keep their records but lose the property reference.')) return;
      state.properties = state.properties.filter(p => p.id !== id);
    } else if (action === 'delete-tenant') {
      if (!confirm('Delete this tenant?')) return;
      state.tenants = state.tenants.filter(t => t.id !== id);
    } else if (action === 'delete-payment') {
      state.payments = state.payments.filter(p => p.id !== id);
    } else if (action === 'delete-maintenance') {
      state.maintenance = state.maintenance.filter(m => m.id !== id);
    } else if (action === 'delete-agreement') {
      state.agreements = state.agreements.filter(a => a.id !== id);
    } else if (action === 'view-agreement') {
      const rec = state.agreements.find(a => a.id === id);
      if (rec) showAgreement(rec);
      window.scrollTo({ top: document.getElementById('agreement-output').offsetTop - 80, behavior: 'smooth' });
      return;
    } else {
      return;
    }
    saveState();
    renderAll();
  });

  // -------------------------------------------------------- Navigation --
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => setActiveView(b.dataset.view));
  });

  // -------------------------------------------------------- Render all --
  function renderAll() {
    renderPropertyDropdowns();
    renderTenantDropdowns();
    renderPropertyList();
    renderTenantList();
    renderPaymentHistory();
    renderMaintenanceList();
    renderAgreementList();
    renderDashboard();
  }

  // Seed example data on first load so the dashboard isn't empty
  function seedIfEmpty() {
    if (state.properties.length || state.tenants.length || state.payments.length) return;
    const propId = uid();
    const tenantId = uid();
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, 5).toISOString().slice(0, 10);
    const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 5).toISOString().slice(0, 10);
    const period = (offset) => {
      const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    };
    state.properties.push({
      id: propId,
      address: '742 Evergreen Terrace',
      city: 'Atlanta', state: 'GA', zip: '30301',
      type: 'Single Family', bedrooms: 3,
      rent: 1800, purchase: 240000,
      createdAt: today.toISOString(),
    });
    state.tenants.push({
      id: tenantId,
      propertyId: propId,
      name: 'Alex Rivera',
      whatsapp: '+1 555 010 2030',
      email: 'alex.rivera@example.com',
      leaseStart: new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().slice(0, 10),
      leaseEnd: new Date(today.getFullYear() + 1, today.getMonth() - 6, 1).toISOString().slice(0, 10),
      dueDay: 1, autoDebit: 'on',
      createdAt: today.toISOString(),
    });
    state.payments.push(
      { id: uid(), tenantId, amount: 1800, date: monthAgo, method: 'Auto-Debit', period: period(1), createdAt: today.toISOString() },
      { id: uid(), tenantId, amount: 1800, date: twoMonthsAgo, method: 'Auto-Debit', period: period(2), createdAt: today.toISOString() },
    );
    state.maintenance.push({
      id: uid(), propertyId: propId,
      date: monthAgo, category: 'Plumbing',
      description: 'Replaced kitchen faucet', cost: 185, vendor: 'ABC Plumbing',
      createdAt: today.toISOString(),
    });
    saveState();
  }

  seedIfEmpty();
  bindForms();
  renderAll();
  setActiveView('dashboard');
})();
