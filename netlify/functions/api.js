// Netlify Function — API Masambukidi Protection
// Compatible avec Netlify Functions (Node.js)
// Base de données : stockage JSON en mémoire (pour démo Netlify)
// Pour la production avec persistance : connecter Supabase, PlanetScale ou Neon

const crypto = require('crypto');

// ============================================================
// STOCKAGE EN MÉMOIRE (remplacer par une vraie DB en prod)
// ============================================================
let reports = [];
let authorized_content = [];
let permission_requests = [];
let monitoring_alerts = [];
let legal_cases = [];
let alert_subscribers = [];

const user_profiles = [
  {
    id: 1,
    full_name: 'Sarah Masambukidi',
    email: 'sarah.masambukidi@example.com',
    role: 'member',
    status: 'active',
    joined_at: '2024-05-18T10:24:00Z',
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=facearea&facepad=2'
  },
  {
    id: 2,
    full_name: 'Jean Kulala',
    email: 'jean.kulala@example.com',
    role: 'editor',
    status: 'active',
    joined_at: '2023-11-02T15:40:00Z',
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=facearea&facepad=2'
  },
  {
    id: 3,
    full_name: 'Amani Katiopa',
    email: 'amani.katiopa@example.com',
    role: 'reviewer',
    status: 'suspended',
    joined_at: '2022-09-12T08:15:00Z',
    avatar_url: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?q=80&w=200&auto=format&fit=facearea&facepad=2'
  }
];

// ============================================================
// UTILITAIRES
// ============================================================
function generateRef(prefix) {
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth()+1).padStart(2,'0') +
    String(date.getDate()).padStart(2,'0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${dateStr}-${rand}`;
}

function formatDate(date) {
  const months = ['janvier','février','mars','avril','mai','juin',
    'juillet','août','septembre','octobre','novembre','décembre'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const ADMIN_TOKEN = 'admin_masambukidi_2024_secret';

function isAdmin(event) {
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (auth.replace('Bearer ', '') === ADMIN_TOKEN) return true;
  const url = new URL('https://x.com' + event.path + (event.rawQuery ? '?' + event.rawQuery : ''));
  if (url.searchParams.get('token') === ADMIN_TOKEN) return true;
  return false;
}

function json(data, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(data),
  };
}

function html(content, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: content,
  };
}

const abuseLabels = {
  usurpation_identite: "Usurpation d'identité",
  contenu_non_autorise: "Utilisation non autorisée du nom et/ou de l'image",
  diffamation: "Diffamation publique",
  usage_commercial: "Exploitation commerciale non autorisée",
  harcelement: "Harcèlement",
  fraude: "Fraude et escroquerie",
  autre: "Violation des droits de la personnalité"
};

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
exports.handler = async function(event, context) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  // Extraire le chemin sans le préfixe /.netlify/functions/api
  const rawPath = event.path.replace('/.netlify/functions/api', '') || '/';
  const method = event.httpMethod;
  const requestUrl = new URL('https://x.com' + event.path + (event.rawQuery ? '?' + event.rawQuery : ''));
  let body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch(e) {}

  // ─── ROUTES ───────────────────────────────────────────────

  // LOGIN
  if (method === 'POST' && rawPath === '/admin/login') {
    const { username, password } = body;
    if (username === 'admin' && password === 'masambukidi!2024') {
      return json({
        success: true,
        token: ADMIN_TOKEN,
        user: { username: 'admin', role: 'superadmin', name: 'Administrateur Masambukidi I' }
      });
    }
    return json({ success: false, error: 'Identifiants incorrects' }, 401);
  }

  // SIGNALEMENT — SOUMETTRE
  if (method === 'POST' && rawPath === '/report/submit') {
    const { url, platform, abuse_type, description, reporter_email, reporter_name } = body;
    if (!url || !platform || !abuse_type || !description || !reporter_email) {
      return json({ success: false, error: 'Champs obligatoires manquants' }, 400);
    }
    const ref = generateRef('SIG');
    const report = {
      id: reports.length + 1,
      ref_number: ref,
      url, platform, abuse_type, description,
      reporter_email, reporter_name: reporter_name || '',
      status: 'pending', priority: 'normal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null, actions_taken: '', admin_notes: ''
    };
    reports.push(report);
    return json({
      success: true,
      ref_number: ref,
      message: 'Signalement enregistré avec succès.',
      tracking_url: `/verifier?ref=${ref}`
    });
  }

  // SIGNALEMENT — STATUT
  if (method === 'GET' && rawPath.startsWith('/report/status/')) {
    const ref = rawPath.split('/').pop();
    const report = reports.find(r => r.ref_number === ref);
    if (!report) return json({ success: false, error: 'Signalement introuvable' }, 404);
    const statusLabels = {
      pending: 'En attente de traitement',
      processing: 'En cours de traitement',
      resolved: 'Résolu - Contenu retiré',
      rejected: 'Rejeté - Non fondé',
      legal_action: 'Action légale en cours'
    };
    return json({ success: true, data: { ...report, status_label: statusLabels[report.status] || report.status } });
  }

  // STATS PUBLIQUES
  if (method === 'GET' && rawPath === '/reports/stats') {
    const total = reports.length;
    const resolved = reports.filter(r => r.status === 'resolved').length;
    const authorized = authorized_content.filter(a => a.is_active).length;
    const recent = reports.filter(r => {
      const d = new Date(r.created_at);
      const now = new Date();
      return (now - d) < 30 * 24 * 60 * 60 * 1000;
    }).length;
    const byStatus = ['pending','processing','resolved','rejected','legal_action'].map(s => ({
      status: s, count: reports.filter(r => r.status === s).length
    }));
    return json({
      success: true,
      stats: {
        total_reports: total,
        resolved_reports: resolved,
        authorized_contents: authorized,
        last_30_days: recent,
        by_status: byStatus,
        success_rate: total > 0 ? Math.round((resolved / total) * 100) : 0
      }
    });
  }

  // VÉRIFICATION CONTENU
  if (method === 'POST' && rawPath === '/verify/content') {
    const { url: urlToCheck } = body;
    if (!urlToCheck) return json({ success: false, error: 'URL requise' }, 400);
    const auth = authorized_content.find(a => a.url === urlToCheck && a.is_active);
    if (auth) {
      return json({
        success: true, is_authorized: true,
        certificate: {
          number: auth.cert_number,
          beneficiary: auth.beneficiary_name,
          content_type: auth.content_type,
        },
        message: 'Ce contenu est officiellement autorisé par Sa Majesté Masambukidi I'
      });
    }
    return json({
      success: true, is_authorized: false,
      message: "Ce contenu n'est pas dans notre liste de contenus autorisés.",
      report_url: '/signaler'
    });
  }

  // LISTE CONTENUS AUTORISÉS
  if (method === 'GET' && rawPath === '/authorized/list') {
    return json({ success: true, count: authorized_content.filter(a => a.is_active).length, data: authorized_content.filter(a => a.is_active) });
  }

  // DEMANDE D'AUTORISATION (redirigée vers email en prod)
  if (method === 'POST' && rawPath === '/permission/request') {
    const { requester_name, requester_email, usage_purpose, content_description } = body;
    if (!requester_name || !requester_email || !usage_purpose || !content_description) {
      return json({ success: false, error: 'Champs obligatoires manquants' }, 400);
    }
    const ticket = generateRef('AUT');
    permission_requests.push({
      id: permission_requests.length + 1,
      ticket_number: ticket,
      ...body,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    return json({
      success: true,
      ticket_number: ticket,
      message: 'Votre demande a été enregistrée. Délai de réponse: 5-10 jours ouvrables.'
    });
  }

  // ALERTES PUBLIQUES
  if (method === 'GET' && rawPath === '/monitor/alerts') {
    const active = monitoring_alerts.filter(a => ['new','reviewing'].includes(a.status));
    return json({ success: true, count: active.length, data: active });
  }

  // ANALYSE IA
  if (method === 'POST' && rawPath === '/ai/analyze') {
    const { content, content_type } = body;
    if (!content) return json({ success: false, error: 'Contenu requis' }, 400);
    const KEYWORDS = ['masambukidi','nitufuidi','kulala','kwamakanda','papa masambukidi','elucco','e.lu.c.co'];
    const lower = content.toLowerCase();
    const detected = KEYWORDS.filter(k => lower.includes(k));
    let score = detected.length * 2;
    const violations = [];
    if (detected.length > 0) violations.push(`Mots-clés protégés : ${detected.join(', ')}`);
    if (/vente|acheter|€|usd|prix|tarif/i.test(content)) { score += 3; violations.push('Utilisation commerciale potentielle'); }
    if (/faux|fake|arnaque|imposteur/i.test(content)) { score += 3; violations.push('Contenu frauduleux potentiel'); }
    const level = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
    return json({
      success: true,
      analysis: { risk_level: level, risk_score: Math.min(10, score), violations, detected_keywords: detected, content_type },
      powered_by: 'local'
    });
  }

  // ABONNEMENT ALERTES
  if (method === 'POST' && rawPath === '/alerts/subscribe') {
    const { email, name } = body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: 'Email invalide' }, 400);
    }
    const existing = alert_subscribers.find(s => s.email === email);
    if (existing) { existing.is_active = true; }
    else { alert_subscribers.push({ id: alert_subscribers.length + 1, email, name: name || '', is_active: true, created_at: new Date().toISOString() }); }
    return json({ success: true, message: 'Abonnement activé.' });
  }

  // PROFIL UTILISATEUR
  if (method === 'GET' && rawPath.startsWith('/user/profile')) {
    const pathParts = rawPath.split('/').filter(Boolean);
    const pathId = pathParts.length >= 3 ? pathParts[2] : null;
    const queryId = requestUrl.searchParams.get('user_id');
    const userId = pathId || queryId;

    if (!userId) {
      return json({ success: false, error: 'Identifiant utilisateur requis' }, 400);
    }

    if (!/^[0-9]+$/.test(userId)) {
      return json({ success: false, error: 'Identifiant utilisateur invalide' }, 400);
    }

    const numericId = Number(userId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return json({ success: false, error: 'Identifiant utilisateur invalide' }, 400);
    }

    const profile = user_profiles.find(p => p.id === numericId);
    if (!profile) {
      return json({ success: false, error: 'Profil utilisateur introuvable' }, 404);
    }

    return json({ success: true, data: profile });
  }

  // ─── ADMIN ROUTES ──────────────────────────────────────────

  if (!isAdmin(event) && rawPath.startsWith('/admin/')) {
    return json({ error: 'Non autorisé' }, 401);
  }

  // ADMIN — SIGNALEMENTS
  if (method === 'GET' && rawPath === '/admin/reports') {
    const total = reports.length;
    const pending = reports.filter(r => r.status === 'pending').length;
    const resolved = reports.filter(r => r.status === 'resolved').length;
    const legal = reports.filter(r => r.status === 'legal_action').length;
    return json({
      success: true,
      summary: { total, pending, resolved, legal_action: legal },
      data: [...reports].reverse().slice(0, 50)
    });
  }

  // ADMIN — TRAITER SIGNALEMENT
  if (method === 'PUT' && rawPath.match(/^\/admin\/report\/\d+\/process$/)) {
    const id = parseInt(rawPath.split('/')[3]);
    const r = reports.find(rep => rep.id === id);
    if (!r) return json({ success: false, error: 'Introuvable' }, 404);
    Object.assign(r, {
      status: body.status || r.status,
      actions_taken: body.actions_taken || r.actions_taken,
      admin_notes: body.admin_notes || r.admin_notes,
      updated_at: new Date().toISOString(),
      resolved_at: body.status === 'resolved' ? new Date().toISOString() : r.resolved_at
    });
    return json({ success: true, message: 'Signalement mis à jour' });
  }

  // ADMIN — DASHBOARD STATS
  if (method === 'GET' && rawPath === '/admin/dashboard-stats') {
    const total = reports.length;
    const pending = reports.filter(r => r.status === 'pending').length;
    const resolved = reports.filter(r => r.status === 'resolved').length;
    const legal = reports.filter(r => r.status === 'legal_action').length;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekReports = reports.filter(r => new Date(r.created_at) > weekAgo).length;
    return json({
      success: true,
      data: {
        total_reports: total,
        pending_reports: pending,
        resolved_reports: resolved,
        legal_action: legal,
        permission_requests: permission_requests.length,
        authorized_contents: authorized_content.filter(a => a.is_active).length,
        legal_cases: legal_cases.length,
        new_alerts: monitoring_alerts.filter(a => a.status === 'new').length,
        week_reports: weekReports,
        by_platform: [],
        recent_reports: [...reports].reverse().slice(0, 5)
      }
    });
  }

  // ADMIN — LISTE BLANCHE
  if (method === 'POST' && rawPath === '/admin/whitelist/add') {
    if (!isAdmin(event)) return json({ error: 'Non autorisé' }, 401);
    const cert = generateRef('CERT');
    authorized_content.push({
      id: authorized_content.length + 1,
      cert_number: cert,
      ...body,
      is_active: true,
      date_authorized: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    return json({ success: true, cert_number: cert, message: 'Contenu ajouté à la liste blanche' });
  }

  // ADMIN — PERMISSIONS
  if (method === 'GET' && rawPath === '/admin/permissions') {
    return json({ success: true, data: [...permission_requests].reverse() });
  }

  if (method === 'PUT' && rawPath.match(/^\/admin\/permission\/\d+\/respond$/)) {
    const id = parseInt(rawPath.split('/')[3]);
    const p = permission_requests.find(r => r.id === id);
    if (!p) return json({ success: false, error: 'Introuvable' }, 404);
    Object.assign(p, { status: body.status, admin_notes: body.admin_notes, rejection_reason: body.rejection_reason, responded_at: new Date().toISOString() });
    return json({ success: true, message: 'Demande mise à jour' });
  }

  // ADMIN — DOSSIERS JURIDIQUES
  if (method === 'GET' && rawPath === '/admin/legal-cases') {
    return json({ success: true, data: [...legal_cases].reverse() });
  }

  if (method === 'POST' && rawPath === '/admin/legal-case/create') {
    if (!isAdmin(event)) return json({ error: 'Non autorisé' }, 401);
    const { report_id, case_type, offender_name, offender_email, offender_platform_id } = body;
    const report = reports.find(r => r.id === parseInt(report_id));
    if (!report) return json({ error: 'Signalement introuvable' }, 404);
    const caseNum = generateRef('JUR');
    const today = formatDate(new Date());
    const typeLabel = case_type === 'plainte_formelle' ? 'PLAINTE FORMELLE' :
                      case_type === 'injonction' ? 'INJONCTION DE RETRAIT' : 'MISE EN DEMEURE';
    const abuseLabel = abuseLabels[(report.abuse_type || '').toLowerCase()] || report.abuse_type || "Utilisation non autorisée";
    const docContent = `${typeLabel} — ${caseNum}\nSignalement: ${report.ref_number}\nContrevenant: ${offender_name}\nPlateforme: ${report.platform}\nType d'infraction: ${abuseLabel}\nDate: ${today}`;
    const newCase = {
      id: legal_cases.length + 1,
      case_number: caseNum,
      report_id: parseInt(report_id),
      case_type: case_type || 'mise_en_demeure',
      offender_name: offender_name || '',
      offender_email: offender_email || '',
      offender_platform_id: offender_platform_id || '',
      document_content: docContent,
      status: 'draft',
      ref_number: report.ref_number,
      report_url: report.url,
      report_platform: report.platform,
      report_desc: report.description,
      abuse_type: report.abuse_type,
      platform: report.platform,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    legal_cases.push(newCase);
    return json({ success: true, case_number: caseNum, document: docContent });
  }

  if (method === 'PUT' && rawPath.match(/^\/admin\/legal-case\/\d+\/sign$/)) {
    const id = parseInt(rawPath.split('/')[3]);
    const lc = legal_cases.find(c => c.id === id);
    if (!lc) return json({ success: false, error: 'Introuvable' }, 404);
    lc.status = 'signed';
    lc.signed_at = new Date().toISOString();
    lc.lawyer_signature = body.signature_data || 'Signé électroniquement';
    return json({ success: true, message: 'Document signé' });
  }

  // ADMIN — DOCUMENT HTML
  if (method === 'GET' && rawPath.match(/^\/admin\/legal-case\/\d+\/html$/)) {
    const id = parseInt(rawPath.split('/')[3]);
    const lc = legal_cases.find(c => c.id === id);
    if (!lc) return json({ error: 'Dossier introuvable' }, 404);
    const today = formatDate(new Date());
    const isSigned = lc.status === 'signed';
    const typeLabels = {
      mise_en_demeure: 'MISE EN DEMEURE OFFICIELLE',
      plainte_formelle: 'PLAINTE FORMELLE',
      injonction: 'INJONCTION DE RETRAIT'
    };
    const docTitle = typeLabels[lc.case_type] || 'MISE EN DEMEURE OFFICIELLE';
    const htmlAbuseLabel = abuseLabels[(lc.abuse_type || '').toLowerCase()] || lc.abuse_type || "Utilisation non autorisée du nom et/ou de l'image";
    const signedBanner = isSigned
      ? `<div style="background:#F0FDF4;border-left:3pt solid #16A34A;padding:8pt 12pt;margin:10pt 0 14pt;font-size:9pt;"><strong style="color:#15803D;">DOCUMENT SIGNÉ ÉLECTRONIQUEMENT</strong> — Signé le : ${lc.signed_at || today} — Administration E.LU.C.CO.</div>`
      : `<div style="background:#FFFBEB;border-left:3pt solid #D97706;padding:8pt 12pt;margin:10pt 0 14pt;font-size:9pt;color:#92400E;font-weight:600;">DOCUMENT EN COURS DE VALIDATION — EN ATTENTE DE SIGNATURE</div>`;

    const docHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${docTitle} — ${lc.case_number} — E.LU.C.CO.</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:'Source Sans 3',Arial,sans-serif;font-size:10.5pt;color:#1A1A1A;background:#fff;line-height:1.7;}
  .page{max-width:210mm;margin:0 auto;padding:18mm 22mm 20mm 26mm;min-height:297mm;background:#fff;box-shadow:0 0 0 1pt #E8DCC8,0 0 0 4pt #F5F0E8;}
  .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-family:'EB Garamond',serif;font-size:88pt;font-weight:700;color:rgba(26,58,26,0.04);pointer-events:none;z-index:0;white-space:nowrap;user-select:none;}
  .content-wrap{position:relative;z-index:1;}
  .top-stripe{height:6pt;background:#1A3A1A;}
  .sub-stripe{height:2pt;background:#C9A227;margin-bottom:18pt;}
  .doc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20pt;padding-bottom:14pt;margin-bottom:14pt;border-bottom:1pt solid #C9A227;}
  .header-left{display:flex;align-items:center;gap:14pt;flex:1;}
  .header-logo{font-family:'EB Garamond',serif;font-size:24pt;font-weight:700;color:#1A3A1A;border:2pt solid #C9A227;padding:8pt 14pt;text-align:center;background:#FAFAF7;}
  .org-text h1{font-family:'EB Garamond',serif;font-size:14pt;font-weight:700;color:#1A3A1A;line-height:1.2;margin-bottom:3pt;}
  .org-text .subtitle{font-size:9pt;color:#4A6A4A;font-weight:600;margin-bottom:2pt;}
  .org-text .ordinance{font-size:7.5pt;color:#777;font-style:italic;}
  .ref-box{border:1pt solid #D4C5A3;background:#FAFAF7;padding:10pt 12pt;}
  .ref-box-label{font-size:7pt;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4pt;border-bottom:0.5pt solid #E2D9C9;padding-bottom:3pt;}
  .ref-box-number{font-family:'Courier New',monospace;font-size:11.5pt;font-weight:700;color:#1A3A1A;margin-bottom:6pt;}
  .ref-box-line{font-size:8pt;color:#666;line-height:1.5;}
  .ref-box-line strong{color:#333;}
  .doc-title-wrap{margin:18pt 0;text-align:center;}
  .doc-title-main{font-family:'EB Garamond',serif;font-size:17pt;font-weight:700;color:#1A3A1A;text-transform:uppercase;letter-spacing:2px;border-top:1.5pt double #1A3A1A;border-bottom:1.5pt double #1A3A1A;padding:10pt 0;margin:0 20pt;}
  .dest-block{margin:14pt 0;padding:10pt 16pt;background:#F9F7F4;border-left:3pt solid #1A3A1A;}
  .dest-label{font-size:7.5pt;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5pt;}
  .dest-name{font-family:'EB Garamond',serif;font-size:12pt;font-weight:700;color:#1A1A1A;}
  .dest-details{font-size:9pt;color:#555;margin-top:4pt;}
  .section-heading{font-family:'EB Garamond',serif;font-size:9pt;font-weight:700;color:#1A3A1A;text-transform:uppercase;letter-spacing:2px;border-bottom:0.5pt solid #1A3A1A;padding-bottom:3pt;margin:18pt 0 10pt;}
  .facts-table{width:100%;border-collapse:collapse;margin:6pt 0 14pt;font-size:9.5pt;}
  .facts-table tr{border-bottom:0.5pt solid #EDE8DE;}
  .facts-table td{padding:5pt 8pt;vertical-align:top;}
  .facts-table td:first-child{font-weight:600;color:#555;width:35%;background:#FAFAF7;border-right:0.5pt solid #EDE8DE;}
  .body-para{font-size:10.5pt;line-height:1.75;text-align:justify;color:#222;margin-bottom:9pt;}
  .article{margin:8pt 0;padding:7pt 12pt 7pt 16pt;font-size:9.5pt;color:#333;line-height:1.65;border-left:2pt solid #C9A227;background:#FDFCF9;}
  .demand-row{display:flex;gap:10pt;margin:7pt 0;font-size:10pt;line-height:1.65;color:#1A1A1A;}
  .demand-num{font-family:'EB Garamond',serif;font-size:11pt;font-weight:700;color:#1A3A1A;min-width:18pt;margin-top:1pt;}
  .warning-block{background:#FEF9EC;border:1pt solid #D97706;border-left:3pt solid #D97706;padding:10pt 14pt;margin:12pt 0;font-size:9.5pt;color:#7C4A00;line-height:1.65;}
  .warning-title{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B45309;margin-bottom:6pt;}
  .sig-section{margin-top:22pt;}
  .sig-row{display:flex;justify-content:space-between;gap:16pt;margin-top:14pt;}
  .sig-col{flex:1;text-align:center;}
  .sig-label{font-size:7.5pt;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4pt;}
  .sig-line{height:50pt;border-bottom:1pt solid #333;margin-bottom:5pt;position:relative;}
  .sig-written{position:absolute;bottom:6pt;left:0;right:0;text-align:center;font-family:'EB Garamond',serif;font-size:12pt;font-style:italic;color:#1A3A1A;}
  .sig-name-text{font-weight:700;font-size:9.5pt;color:#1A1A1A;}
  .sig-role-text{font-size:8pt;color:#666;margin-top:1pt;}
  .stamp-circle{width:78pt;height:78pt;border:2.5pt solid #1A3A1A;border-radius:50%;margin:0 auto 4pt;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8pt;text-align:center;background:#F8FBF8;}
  .stamp-main-text{font-size:6.5pt;font-weight:700;color:#1A3A1A;text-transform:uppercase;line-height:1.3;}
  .stamp-sep{font-size:5pt;color:#4A6A4A;margin:2pt 0;border-top:0.5pt solid #4A6A4A;border-bottom:0.5pt solid #4A6A4A;padding:0.5pt 4pt;width:100%;}
  .stamp-sub-text{font-size:5.5pt;color:#4A6A4A;text-transform:uppercase;line-height:1.4;}
  .bottom-stripe-gold{height:2pt;background:#C9A227;margin-top:22pt;}
  .bottom-stripe-dark{height:4pt;background:#1A3A1A;margin-bottom:10pt;}
  .doc-footer{font-size:7.5pt;color:#999;text-align:center;line-height:1.6;max-width:210mm;margin:0 auto;padding:0 22mm;}
  .verif-strip{margin-top:6pt;background:#FAFAF7;border:0.5pt solid #E2D9C9;padding:5pt 12pt;font-size:7pt;color:#AAA;}
  .print-btn{position:fixed;top:14pt;right:18pt;background:#1A3A1A;color:#fff;border:none;padding:7pt 16pt;font-size:9pt;font-weight:600;border-radius:4pt;cursor:pointer;z-index:100;}
  @media print{.page{padding:15mm 18mm;box-shadow:none;}.print-btn{display:none;}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Imprimer / PDF</button>
<div class="watermark">E.LU.C.CO.</div>
<div class="top-stripe"></div>
<div class="sub-stripe"></div>
<div class="page">
<div class="content-wrap">

<div class="doc-header">
  <div class="header-left">
    <div class="header-logo">E.LU.C.CO.</div>
    <div class="org-text">
      <h1>ÉGLISE LUMIÈRE DU CHRIST AU CONGO</h1>
      <div class="subtitle">E.LU.C.CO. — Administration Officielle</div>
      <div class="ordinance">Ord. Présidentielle N° 97-031 du 14 Mars 1997 · Personnalité Civile Reconnue</div>
      <div class="ordinance">Kinshasa, République Démocratique du Congo</div>
      <div class="ordinance">masambukidiste1983@gmail.com · dnitufuidi@gmail.com</div>
    </div>
  </div>
  <div>
    <div class="ref-box">
      <div class="ref-box-label">Référence</div>
      <div class="ref-box-number">${lc.case_number}</div>
      <div class="ref-box-line"><strong>Date :</strong> ${today}</div>
      <div class="ref-box-line"><strong>Lieu :</strong> Kinshasa, R.D.C.</div>
      <div class="ref-box-line"><strong>Type :</strong> ${docTitle}</div>
    </div>
  </div>
</div>

${signedBanner}

<div class="doc-title-wrap">
  <div style="font-size:7pt;font-weight:700;color:#999;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8pt;">Document officiel · E.LU.C.CO.</div>
  <div class="doc-title-main">${docTitle}</div>
  <div style="font-size:8pt;color:#888;margin-top:6pt;font-style:italic;">Référence : ${lc.case_number} · Kinshasa, le ${today}</div>
</div>

<div class="dest-block">
  <div class="dest-label">À l'attention de</div>
  <div class="dest-name">${lc.offender_name || 'Le Contrevenant Identifié'}</div>
  <div class="dest-details">
    ${lc.offender_email ? 'Email : ' + lc.offender_email + '<br>' : ''}
    Plateforme : ${lc.platform || 'Non spécifiée'}
    ${lc.offender_platform_id ? ' · Identifiant : ' + lc.offender_platform_id : ''}
  </div>
</div>

<div class="section-heading">Objet</div>
<p class="body-para">
  <strong>Objet : ${docTitle} — ${htmlAbuseLabel} — Sa Majesté Masambukidi I, Chef Spirituel de l'E.LU.C.CO.</strong>
</p>
<p class="body-para">
  Monsieur / Madame <strong>${lc.offender_name || '(le contrevenant identifié)'}</strong>,
</p>
<p class="body-para">
  Par la présente, l'Administration de <strong>Sa Majesté Papa Samuel Masambukidi I</strong>, Chef Spirituel de l'Église Lumière du Christ au Congo (E.LU.C.CO.), institution dotée d'une personnalité civile officielle en République Démocratique du Congo en vertu de l'<strong>Ordonnance Présidentielle N° 97-031 du 14 Mars 1997</strong>, a été informée que vous faites usage, sans autorisation préalable et écrite, du nom, de l'image et/ou de la réputation de Sa Majesté.
</p>
<p class="body-para">
  Cette utilisation constitue une <strong>violation caractérisée des droits de la personnalité</strong> de Sa Majesté Masambukidi I, et engage votre responsabilité civile et pénale conformément au droit congolais en vigueur.
</p>

<div class="section-heading">Faits constatés</div>
<table class="facts-table">
  <tr><td>N° de signalement</td><td>${lc.ref_number || 'N/A'}</td></tr>
  <tr><td>Nature de l'infraction</td><td>${htmlAbuseLabel}</td></tr>
  <tr><td>Plateforme concernée</td><td>${lc.platform || 'Non spécifiée'}</td></tr>
  <tr><td>URL ou contenu litigieux</td><td style="word-break:break-all;">${lc.report_url || 'Non communiquée'}</td></tr>
  <tr><td>Description des faits</td><td>${lc.report_desc || 'Utilisation non autorisée constatée par nos services'}</td></tr>
  <tr><td>Date de constatation</td><td>${today}</td></tr>
  <tr><td>Auteur du constat</td><td>Administration E.LU.C.CO. — Service de Protection des Droits</td></tr>
</table>

<div class="section-heading">Fondements juridiques</div>
<div class="article"><strong>Article 1 — Personnalité civile et droits institutionnels</strong><br>L'E.LU.C.CO. bénéficie de la personnalité civile reconnue par l'<strong>Ordonnance Présidentielle N° 97-031 du 14 Mars 1997</strong>, lui conférant le droit à la protection de l'image, du nom et de la réputation de ses représentants.</div>
<div class="article"><strong>Article 2 — Protection des droits de la personnalité</strong><br>Conformément au <strong>Code Civil Congolais, Livre III</strong>, toute utilisation non autorisée du nom ou de l'image d'une personnalité reconnue constitue une atteinte aux droits de la personnalité, ouvrant droit à réparation et poursuite judiciaire.</div>
<div class="article"><strong>Article 3 — Infractions pénales</strong><br>L'<strong>Article 124 du Code Pénal Congolais</strong> et la <strong>loi n° 23/010 du 13 mars 2023</strong> (Code du Numérique) prévoient des sanctions spécifiques pour toute infraction commise par voie électronique ou sur les plateformes numériques.</div>

<div class="section-heading">Demandes formelles</div>
<p class="body-para">En application des textes susvisés, nous vous sommions de :</p>
<div class="demand-row"><div class="demand-num">1.</div><div><strong>CESSER IMMÉDIATEMENT</strong> toute utilisation du nom « Masambukidi », « Papa Masambukidi Samuel », « Sa Majesté Masambukidi I » ou tout dérivé.</div></div>
<div class="demand-row"><div class="demand-num">2.</div><div><strong>RETIRER SOUS 48 HEURES</strong> la totalité des contenus litigieux accessibles au public.</div></div>
<div class="demand-row"><div class="demand-num">3.</div><div><strong>CONFIRMER PAR ÉCRIT</strong> à l'adresse <strong>masambukidiste1983@gmail.com</strong> la réalisation effective du retrait.</div></div>
<div class="demand-row"><div class="demand-num">4.</div><div><strong>S'ENGAGER À NE PAS RÉCIDIVER</strong> sous quelque forme que ce soit, à peine de poursuites immédiates.</div></div>

<div class="section-heading">Avertissement</div>
<div class="warning-block">
  <div class="warning-title">Conséquences strictes en cas de non-respect</div>
  À défaut de réponse satisfaisante dans le délai de <strong>48 heures</strong>, l'Administration de Sa Majesté se réserve le droit de :<br><br>
  — Déposer une <strong>plainte formelle</strong> auprès du Parquet de Kinshasa ;<br>
  — Introduire une <strong>action civile en dommages et intérêts</strong> ;<br>
  — Saisir les <strong>équipes juridiques des plateformes</strong> (Meta, Google, TikTok, YouTube, etc.) ;<br>
  — Solliciter une <strong>injonction judiciaire</strong> de blocage et suppression ;<br>
  — Publier un <strong>communiqué officiel</strong> E.LU.C.CO. rendant publique la situation.
</div>

<p class="body-para" style="font-size:9.5pt;color:#555;font-style:italic;">
  Pour toute demande de régularisation, contactez l'Administration officielle : <strong>masambukidiste1983@gmail.com</strong>
</p>

<div style="margin:14pt 0 10pt;font-size:10pt;color:#333;">Fait à <strong>Kinshasa, République Démocratique du Congo</strong>, le <strong>${today}</strong>.</div>

<div class="sig-section">
  <div class="section-heading">Signatures et cachet</div>
  <div class="sig-row">
    <div class="sig-col">
      <div class="sig-label">L'Administration</div>
      <div class="sig-line">${isSigned ? '<div class="sig-written">Administrateur Masambukidi I</div>' : ''}</div>
      <div class="sig-name-text">Responsable Administratif</div>
      <div class="sig-role-text">E.LU.C.CO. — Protection des Droits</div>
      <div style="font-size:7.5pt;color:${isSigned ? '#16A34A' : '#999'};font-weight:600;margin-top:3pt;">${isSigned ? 'Signé le ' + (lc.signed_at || today) : '(Signature à apposer)'}</div>
    </div>
    <div class="sig-col" style="flex:0.8;">
      <div class="sig-label">Cachet Officiel</div>
      <div class="stamp-circle">
        <div class="stamp-main-text">ÉGLISE LUMIÈRE<br>DU CHRIST<br>AU CONGO</div>
        <div class="stamp-sep">E.LU.C.CO.</div>
        <div class="stamp-sub-text">ORD. N° 97-031<br>14 MARS 1997<br>KINSHASA — R.D.C.</div>
      </div>
      <div class="sig-name-text">Cachet Officiel</div>
      <div class="sig-role-text">Personnalité Civile Reconnue</div>
    </div>
    <div class="sig-col">
      <div class="sig-label">Le Destinataire</div>
      <div class="sig-line"></div>
      <div class="sig-name-text">Signature pour réception</div>
      <div class="sig-role-text">${lc.offender_name || '(Nom du destinataire)'}</div>
      <div style="font-size:7.5pt;color:#999;margin-top:3pt;">Date de réception : _______________</div>
    </div>
  </div>
</div>

</div>
</div>

<div class="bottom-stripe-gold"></div>
<div class="bottom-stripe-dark"></div>
<div class="doc-footer">
  <p>E.LU.C.CO. — Église Lumière du Christ au Congo · Kinshasa, République Démocratique du Congo</p>
  <p>masambukidiste1983@gmail.com · dnitufuidi@gmail.com</p>
  <div class="verif-strip">Document officiel archivé · Référence : <strong>${lc.case_number}</strong></div>
</div>
</body>
</html>`;
    return html(docHtml);
  }

  // ADMIN — ABONNÉS
  if (method === 'GET' && rawPath === '/alerts/subscribers') {
    if (!isAdmin(event)) return json({ error: 'Non autorisé' }, 401);
    return json({ success: true, count: alert_subscribers.length, data: alert_subscribers });
  }

  // ADMIN — BROADCAST
  if (method === 'POST' && rawPath === '/alerts/broadcast') {
    if (!isAdmin(event)) return json({ error: 'Non autorisé' }, 401);
    return json({ success: true, sent: 0, total: alert_subscribers.length, message: 'Fonctionnalité email disponible avec SendGrid configuré' });
  }

  // ADMIN — MONITOR ADD
  if (method === 'POST' && rawPath === '/monitor/add') {
    monitoring_alerts.push({
      id: monitoring_alerts.length + 1,
      ...body,
      status: 'new',
      auto_detected: 1,
      detected_at: new Date().toISOString()
    });
    return json({ success: true, message: 'Alerte enregistrée' });
  }

  // 404
  return json({ error: 'Route non trouvée', path: rawPath }, 404);
};
