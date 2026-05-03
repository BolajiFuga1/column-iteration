(function () {
  'use strict';

  // -------------------------------------------------------------- Storage --
  const STORAGE_KEY = 'renteasy.v3';
  const emptyState = () => ({
    properties: [],
    tenants: [],
    payments: [],
    maintenance: [],
    agreements: [],
    taxes: []
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
    return '₦' + v.toLocaleString('en-NG', { maximumFractionDigits: 0 });
  };
  const moneyExact = (n) => {
    const v = Number(n) || 0;
    return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // ------------------------------------------------------ Paystack mock --
  // Real product would call Paystack API (DVA + transaction endpoints).
  // For the demo we simulate the data shapes.
  const PAYSTACK_BANKS = ['Wema Bank', 'Titan Trust Bank'];
  function generateDVANumber() {
    // 10-digit "Wema-style" virtual account number starting with 99
    let n = '99';
    for (let i = 0; i < 8; i++) n += Math.floor(Math.random() * 10);
    return n;
  }
  function ensureDVA(tenant) {
    if (!tenant.dva || !tenant.dva.accountNumber) {
      tenant.dva = {
        bank: PAYSTACK_BANKS[Math.floor(Math.random() * PAYSTACK_BANKS.length)],
        accountNumber: generateDVANumber(),
        accountName: 'RENTEASY/' + (tenant.name || 'TENANT').toUpperCase().replace(/[^A-Z0-9 \/]/g, '').slice(0, 30),
      };
    }
    return tenant.dva;
  }
  function paystackInvoiceLink() {
    const id = Math.random().toString(36).slice(2, 10);
    return 'https://paystack.com/pay/' + id;
  }
  function buildPaystackInvoiceMessage(tenant, amount, description, link) {
    const auto = tenant.dva
      ? `\n\nOr transfer to your dedicated account anytime: ${tenant.dva.bank} · ${tenant.dva.accountNumber} · ${tenant.dva.accountName}.`
      : '';
    return `Hi ${tenant.name},\n\n${description} of ${moneyExact(amount)} is ready. Tap to pay securely with your card, bank app or USSD:\n${link}${auto}\n\nThank you,\nRentEasy on behalf of your landlord`;
  }

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

  const VIEW_TITLES = {
    dashboard: 'Dashboard',
    properties: 'Properties',
    tenants: 'Tenants',
    payments: 'Rent Collection',
    agreements: 'Tenancy Agreements',
    maintenance: 'Maintenance & Costs',
    taxes: 'Property Taxes',
    demands: 'Payment Demand Letters',
  };

  function setActiveView(name) {
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('hidden', v.dataset.view !== name);
    });
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[name] || 'RentEasy';
    if (name === 'dashboard') renderDashboard();
  }

  // ----------------------------------------------------- Property views --
  function renderPropertyDropdowns() {
    const opts = state.properties.map(p =>
      `<option value="${p.id}">${propertyLabel(p)}</option>`
    ).join('');
    const placeholder = '<option value="">Select a property</option>';
    ['tenant-property-select', 'agreement-property-select', 'maintenance-property-select', 'tax-property-select'].forEach(id => {
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
    ['payment-tenant-select', 'reminder-tenant-select', 'demand-tenant-select', 'paystack-tenant-select'].forEach(id => {
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
      ensureDVA(t);
      const auto = t.autoDebit === 'on'
        ? '<span class="badge ok">Auto-debit</span>'
        : '<span class="badge muted">Reminders only</span>';
      return `
        <div class="list-item">
          <div>
            <div><strong>${t.name}</strong> ${auto}</div>
            <div class="meta">${p ? p.address : '(deleted property)'} &middot; Lease ${fmtDate(t.leaseStart)} → ${fmtDate(t.leaseEnd)}</div>
            <div class="meta">WhatsApp ${t.whatsapp || '—'} &middot; ${t.email || '—'} &middot; Due day ${t.dueDay}</div>
            <div class="dva-box">
              <span class="dva-label">Paystack DVA</span>
              <span class="dva-bank">${t.dva.bank}</span>
              <span class="dva-acct">${t.dva.accountNumber}</span>
              <span class="dva-name">${t.dva.accountName}</span>
              <button class="dva-copy" data-action="copy-dva" data-id="${t.id}">Copy</button>
            </div>
          </div>
          <div class="actions">
            <button class="btn-channel paystack" data-action="simulate-dva-transfer" data-id="${t.id}">⚡ Simulate Transfer In</button>
            <button class="btn-danger" data-action="delete-tenant" data-id="${t.id}">Delete</button>
          </div>
        </div>`;
    }).join('');
    saveState();
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

  function renderTaxList() {
    const list = document.getElementById('tax-list');
    if (!list) return;
    if (!state.taxes.length) {
      list.innerHTML = '<div class="empty">No taxes recorded yet.</div>';
      return;
    }
    const sorted = state.taxes.slice().sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const today = new Date();
    list.innerHTML = sorted.map(x => {
      const p = propertyById(x.propertyId);
      const label = (x.customName && x.customName.trim()) || x.name;
      let badge;
      if (x.status === 'paid') {
        badge = '<span class="badge ok">Paid</span>';
      } else {
        const due = x.dueDate ? new Date(x.dueDate) : null;
        if (due && due < today) badge = '<span class="badge danger">Overdue</span>';
        else badge = '<span class="badge warn">Pending</span>';
      }
      return `
        <div class="list-item">
          <div>
            <div><strong>${label}</strong> ${badge}</div>
            <div class="meta">${p ? p.address + ', ' + p.city + ', ' + p.state : '(deleted property)'} &middot; ${x.frequency || 'Annual'}</div>
            <div class="meta">Amount: ${moneyExact(x.amount)} &middot; Due ${fmtDate(x.dueDate)}${x.paidDate ? ' &middot; Paid ' + fmtDate(x.paidDate) : ''}</div>
          </div>
          <div class="actions">
            ${x.status !== 'paid' ? `<button class="btn-ghost" data-action="mark-tax-paid" data-id="${x.id}">Mark paid</button>` : ''}
            <button class="btn-danger" data-action="delete-tax" data-id="${x.id}">Delete</button>
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
    const maint = state.maintenance
      .filter(m => m.date && new Date(m.date).getFullYear() === year)
      .reduce((s, m) => s + Number(m.cost || 0), 0);
    const taxes = state.taxes
      .filter(x => x.status === 'paid' && x.paidDate && new Date(x.paidDate).getFullYear() === year)
      .reduce((s, x) => s + Number(x.amount || 0), 0);
    return maint + taxes;
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
    const padL = 56, padR = 16, padT = 18, padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const stepX = plotW / Math.max(1, data.length - 1);

    const yFor = (v) => padT + plotH - (v / max) * plotH;
    const xFor = (i) => padL + stepX * i;

    // Gridlines
    ctx.strokeStyle = '#e3eae5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
    }
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#97a39c';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const value = max * (1 - i / 4);
      const y = padT + (plotH * i) / 4;
      ctx.fillText('$' + Math.round(value).toLocaleString(), padL - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      ctx.fillText(d.label, xFor(i), H - padB + 18);
    });

    // Helper: smooth path through points (Catmull-Rom-ish via quadratic curves)
    function tracePath(points, close) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const cx = (points[i].x + points[i + 1].x) / 2;
        const cy = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, cx, cy);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
      if (close) {
        ctx.lineTo(last.x, padT + plotH);
        ctx.lineTo(points[0].x, padT + plotH);
        ctx.closePath();
      }
    }

    function drawSeries(values, color, fill) {
      const points = values.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
      // Filled area
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      tracePath(points, true);
      ctx.fillStyle = grad;
      ctx.fill();
      // Stroke line
      tracePath(points, false);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // Dots
      ctx.fillStyle = color;
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
      });
    }

    drawSeries(data.map(d => d.revenue), '#6fbf85', 'rgba(111,191,133,0.28)');
    drawSeries(data.map(d => d.expenses), '#2c5a3a', 'rgba(44,90,58,0.18)');
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

  function rentRowsForDashboard() {
    const now = new Date();
    return state.tenants.map(t => {
      const p = propertyById(t.propertyId);
      const rent = p ? Number(p.rent || 0) : 0;
      const dueDay = Number(t.dueDay || 1);
      const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
      const nextDue = thisMonthDue >= now ? thisMonthDue : new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
      const daysUntil = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
      const outstanding = outstandingRentForTenant(t);
      return { t, p, rent, nextDue, daysUntil, outstanding };
    });
  }

  function renderOverdueRent() {
    const wrap = document.getElementById('overdue-rent');
    if (!wrap) return;
    if (!state.tenants.length) {
      wrap.innerHTML = '<div class="empty">No tenants yet.</div>';
      return;
    }
    const rows = rentRowsForDashboard()
      .filter(r => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty">All tenants are up to date 🎉</div>';
      return;
    }
    wrap.innerHTML = rows.map(r => `
      <div class="list-item">
        <div>
          <div><strong>${r.t.name}</strong> <span class="badge danger">Overdue</span></div>
          <div class="meta">${r.p ? r.p.address + ', ' + r.p.city : '(no property)'}</div>
          <div class="meta">Owing: <strong style="color:#b91c1c">${moneyExact(r.outstanding)}</strong> &middot; Monthly rent ${moneyExact(r.rent)}</div>
        </div>
        <div class="actions"></div>
      </div>`).join('');
  }

  function renderUpcomingRent() {
    const wrap = document.getElementById('upcoming-rent');
    if (!wrap) return;
    if (!state.tenants.length) {
      wrap.innerHTML = '<div class="empty">No tenants yet.</div>';
      return;
    }
    const rows = rentRowsForDashboard()
      .filter(r => r.outstanding === 0)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty">No upcoming rent — every tenant currently has a balance.</div>';
      return;
    }
    wrap.innerHTML = rows.map(r => {
      const badge = r.daysUntil <= 5
        ? `<span class="badge warn">Due in ${r.daysUntil}d</span>`
        : `<span class="badge ok">Due in ${r.daysUntil}d</span>`;
      return `
      <div class="list-item">
        <div>
          <div><strong>${r.t.name}</strong> ${badge}</div>
          <div class="meta">${r.p ? r.p.address + ', ' + r.p.city : '(no property)'} &middot; Next due ${fmtDate(r.nextDue.toISOString())}</div>
          <div class="meta">Monthly rent ${moneyExact(r.rent)}</div>
        </div>
        <div class="actions"></div>
      </div>`;
    }).join('');
  }

  function renderRecentMaintenance() {
    const wrap = document.getElementById('recent-maintenance');
    if (!wrap) return;
    if (!state.maintenance.length) {
      wrap.innerHTML = '<div class="empty">No maintenance items logged yet.</div>';
      return;
    }
    const sorted = state.maintenance.slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5);
    wrap.innerHTML = sorted.map(m => {
      const p = propertyById(m.propertyId);
      return `
        <div class="list-item">
          <div>
            <div><strong>${m.description}</strong> <span class="badge muted">${m.category}</span></div>
            <div class="meta">${p ? p.address : '(deleted property)'} &middot; ${fmtDate(m.date)} &middot; ${moneyExact(m.cost)}</div>
          </div>
          <div class="actions"></div>
        </div>`;
    }).join('');
  }

  function renderActivityFeed() {
    const wrap = document.getElementById('activity-feed');
    if (!wrap) return;
    const items = [];
    state.payments.forEach(p => {
      const t = tenantById(p.tenantId);
      items.push({
        when: p.date || p.createdAt,
        kind: 'payment',
        what: `Payment of ${moneyExact(p.amount)} from ${t ? t.name : 'tenant'} (${p.method})`,
      });
    });
    state.maintenance.forEach(m => {
      const p = propertyById(m.propertyId);
      items.push({
        when: m.date || m.createdAt,
        kind: 'maintenance',
        what: `${m.description} at ${p ? p.address : 'property'} — ${moneyExact(m.cost)}`,
      });
    });
    state.agreements.forEach(a => {
      items.push({
        when: a.createdAt,
        kind: 'agreement',
        what: `Agreement created for ${a.tenantName}`,
      });
    });
    state.taxes.forEach(x => {
      const p = propertyById(x.propertyId);
      const label = (x.customName && x.customName.trim()) || x.name;
      const status = x.status === 'paid' ? 'paid' : 'logged (due ' + fmtDate(x.dueDate) + ')';
      items.push({
        when: x.paidDate || x.createdAt,
        kind: 'tax',
        what: `${label} ${status} — ${moneyExact(x.amount)}${p ? ' · ' + p.address : ''}`,
      });
    });
    items.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
    const top = items.slice(0, 6);
    if (!top.length) {
      wrap.innerHTML = '<div class="empty">No activity yet.</div>';
      return;
    }
    const ico = { payment: '₦', maintenance: '⚒', agreement: '✎', tax: '%' };
    wrap.innerHTML = top.map(i => `
      <div class="activity-item">
        <div class="icon">${ico[i.kind] || '·'}</div>
        <div>
          <div class="when">${fmtDate(i.when)}</div>
          <div class="what">${i.what}</div>
        </div>
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
    renderOverdueRent();
    renderUpcomingRent();
    renderRecentMaintenance();
    renderActivityFeed();
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
    'Lagos': 'Lagos State Tenancy Law 2011. This Agreement is governed by the Lagos State Tenancy Law (2011). The Landlord shall not demand more than one (1) year\'s rent in advance from a sitting tenant, nor more than six (6) months from a new tenant on a monthly tenancy. Statutory notice periods apply: one (1) week for weekly tenancy, one (1) month for monthly tenancy, three (3) months for quarterly or half-yearly tenancy, and six (6) months for yearly tenancy. Land Use Charge is the responsibility of the Landlord unless otherwise agreed in writing.',
    'FCT (Abuja)': 'FCT (Abuja) Provisions. This Agreement is governed by the Recovery of Premises Act (FCT) and FCT Land Administration regulations. Statutory notice periods apply prior to recovery of premises, and Ground Rent is payable to the Federal Capital Development Authority (FCDA) by the Landlord unless otherwise agreed.',
    'Rivers': 'Rivers State Provisions. This Agreement is governed by the Rivers State Recovery of Premises Law. Tenement Rate is payable by the Landlord to the relevant Local Government Council unless expressly transferred to the Tenant in writing.',
    'Kano': 'Kano State Provisions. This Agreement is governed by the Kano State Recovery of Premises Law. Tenement Rate is payable by the Landlord to the relevant Local Government Council unless expressly transferred to the Tenant in writing.',
    'Oyo': 'Oyo State Provisions. This Agreement is governed by the Oyo State Recovery of Premises Law. Tenement Rate is payable by the Landlord to the relevant Local Government Council unless expressly transferred to the Tenant in writing.',
  };
  function stateSpecificClause(stateName) {
    return STATE_CLAUSES[stateName] ||
      `State-Specific Provisions. This Agreement is governed by the laws of ${stateName} State and the federal laws of the Federal Republic of Nigeria. Statutory notice periods under the Recovery of Premises Law of ${stateName} State apply prior to recovery of possession, and applicable property taxes (Tenement Rate, Land Use Charge or equivalent) are payable by the Landlord unless expressly transferred to the Tenant in writing.`;
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
      const tenant = {
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
      };
      ensureDVA(tenant);
      state.tenants.push(tenant);
      saveState();
      e.target.reset();
      renderAll();
      toast(`Tenant added · DVA ${tenant.dva.bank} ${tenant.dva.accountNumber}`);
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

    // Paystack invoice form: auto-fill amount from property rent when tenant picked
    const paystackTenantSelect = document.getElementById('paystack-tenant-select');
    paystackTenantSelect.addEventListener('change', (e) => {
      const tenant = tenantById(e.target.value);
      if (!tenant) return;
      const p = propertyById(tenant.propertyId);
      const amountInput = document.querySelector('#paystack-form input[name="amount"]');
      if (p && amountInput && !amountInput.value) amountInput.value = Number(p.rent || 0);
    });

    document.getElementById('paystack-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const tenant = tenantById(f.get('tenantId'));
      if (!tenant) { toast('Select a tenant'); return; }
      ensureDVA(tenant);
      const amount = Number(f.get('amount')) || 0;
      const description = (f.get('description') || 'Payment').trim();
      const link = paystackInvoiceLink();
      const text = buildPaystackInvoiceMessage(tenant, amount, description, link);
      // Stash the invoice details on a dataset so the simulate button can use them
      const out = document.getElementById('paystack-output');
      out.classList.remove('hidden');
      out.dataset.tenantId = tenant.id;
      out.dataset.amount = String(amount);
      out.dataset.description = description;
      document.getElementById('paystack-text').textContent = text;
      buildChannelButtons(document.getElementById('paystack-actions'), {
        text,
        whatsappTo: tenant.whatsapp,
        emailTo: tenant.email,
        emailSubject: description + ' — Paystack invoice',
        printTitle: 'Paystack Invoice — ' + tenant.name,
      });
      toast('Paystack invoice link generated (demo)');
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

    document.getElementById('tax-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.taxes.push({
        id: uid(),
        propertyId: f.get('propertyId'),
        name: f.get('name'),
        customName: (f.get('customName') || '').trim(),
        amount: Number(f.get('amount')) || 0,
        dueDate: f.get('dueDate'),
        frequency: f.get('frequency'),
        status: f.get('status') || 'pending',
        paidDate: f.get('paidDate') || '',
        createdAt: new Date().toISOString()
      });
      saveState();
      e.target.reset();
      renderAll();
      toast('Tax record added');
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

  // ------------------------------------------------- Paystack simulation --
  function simulateIncomingPayment(tenant, amount, method) {
    const today = new Date().toISOString().slice(0, 10);
    const period = today.slice(0, 7);
    state.payments.push({
      id: uid(),
      tenantId: tenant.id,
      amount,
      date: today,
      method,
      period,
      createdAt: new Date().toISOString()
    });
    saveState();
    toast(`✓ ${moneyExact(amount)} received from ${tenant.name} via ${method}`);
    renderAll();
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
    } else if (action === 'delete-tax') {
      state.taxes = state.taxes.filter(x => x.id !== id);
    } else if (action === 'mark-tax-paid') {
      const tax = state.taxes.find(x => x.id === id);
      if (tax) {
        tax.status = 'paid';
        tax.paidDate = new Date().toISOString().slice(0, 10);
      }
    } else if (action === 'view-agreement') {
      const rec = state.agreements.find(a => a.id === id);
      if (rec) showAgreement(rec);
      window.scrollTo({ top: document.getElementById('agreement-output').offsetTop - 80, behavior: 'smooth' });
      return;
    } else if (action === 'copy-dva') {
      const tenant = tenantById(id);
      if (!tenant) return;
      ensureDVA(tenant);
      const text = `${tenant.dva.bank} · ${tenant.dva.accountNumber} · ${tenant.dva.accountName}`;
      navigator.clipboard.writeText(text).then(
        () => toast('Account details copied'),
        () => toast('Copy failed — select manually')
      );
      return;
    } else if (action === 'simulate-dva-transfer') {
      const tenant = tenantById(id);
      if (!tenant) return;
      const property = propertyById(tenant.propertyId);
      const amount = property ? Number(property.rent || 0) : 0;
      simulateIncomingPayment(tenant, amount, 'Paystack DVA');
      return;
    } else if (action === 'simulate-paystack-invoice') {
      const out = document.getElementById('paystack-output');
      const tenant = tenantById(out.dataset.tenantId);
      if (!tenant) { toast('Generate an invoice first'); return; }
      const amount = Number(out.dataset.amount) || 0;
      simulateIncomingPayment(tenant, amount, 'Paystack Invoice');
      return;
    } else {
      return;
    }
    saveState();
    renderAll();
  });

  // -------------------------------------------------------- Navigation --
  document.querySelectorAll('.nav-item').forEach(b => {
    b.addEventListener('click', () => setActiveView(b.dataset.view));
  });

  // ---------------------------------------------------- Quick actions --
  document.addEventListener('click', (e) => {
    const qb = e.target.closest('[data-quick-view]');
    if (!qb) return;
    setActiveView(qb.dataset.quickView);
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
    renderTaxList();
    renderDashboard();
  }

  // Seed example data on first load so the dashboard isn't empty
  function seedIfEmpty() {
    if (state.properties.length || state.tenants.length || state.payments.length) return;
    const propId = uid();
    const tenantId = uid();
    const today = new Date();
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, 5).toISOString().slice(0, 10);
    const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 5).toISOString().slice(0, 10);
    const yearEnd = new Date(today.getFullYear(), 11, 31).toISOString().slice(0, 10);
    const period = (offset) => {
      const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    };
    state.properties.push({
      id: propId,
      address: '14 Admiralty Way',
      city: 'Lekki Phase 1', state: 'Lagos', zip: 'Lekki',
      type: 'Apartment', bedrooms: 3,
      rent: 350000, purchase: 95000000,
      createdAt: today.toISOString(),
    });
    const seedTenant = {
      id: tenantId,
      propertyId: propId,
      name: 'Adaobi Okeke',
      whatsapp: '+234 802 123 4567',
      email: 'adaobi.okeke@example.com',
      leaseStart: new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().slice(0, 10),
      leaseEnd: new Date(today.getFullYear() + 1, today.getMonth() - 6, 1).toISOString().slice(0, 10),
      dueDay: 1, autoDebit: 'on',
      createdAt: today.toISOString(),
    };
    ensureDVA(seedTenant);
    state.tenants.push(seedTenant);
    state.payments.push(
      { id: uid(), tenantId, amount: 350000, date: monthAgo, method: 'Bank Transfer', period: period(1), createdAt: today.toISOString() },
      { id: uid(), tenantId, amount: 350000, date: twoMonthsAgo, method: 'Bank Transfer', period: period(2), createdAt: today.toISOString() },
    );
    state.maintenance.push({
      id: uid(), propertyId: propId,
      date: monthAgo, category: 'Plumbing',
      description: 'Replaced kitchen tap', cost: 25000, vendor: 'Lekki Plumbing Services',
      createdAt: today.toISOString(),
    });
    state.taxes.push({
      id: uid(), propertyId: propId,
      name: 'Land Use Charge (Lagos)',
      customName: '',
      amount: 75000,
      dueDate: yearEnd,
      frequency: 'Annual',
      status: 'pending',
      paidDate: '',
      createdAt: today.toISOString(),
    });
    saveState();
  }

  seedIfEmpty();
  bindForms();
  renderAll();
  setActiveView('dashboard');
})();
