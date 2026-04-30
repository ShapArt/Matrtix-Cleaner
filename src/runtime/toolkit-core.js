(() => {
  'use strict';

  const host = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const FLAG = '__OPENTEXT_TOOLKIT_RUNTIME__';
  if (host[FLAG]) return;
  host[FLAG] = true;

  const REQUIRED_AFFILIATION = 'Группа Черкизово';
  const VERSION = '9.0.0-toolkit';

  const DOC_GROUP_A = [
    'Основной договор',
    'Перемена лица в обязательстве',
    'ДС на пролонгацию',
  ];

  const DOC_GROUP_B = [
    'ДС',
    'Спецификация',
    'Спецификация по качеству',
    'Соглашение о бонусах',
    'Перемена лица в обязательстве',
    'Соглашение о зачете',
    'Соглашение по ЭДО',
    'ДС к спецификации',
    'Заверение об обстоятельствах',
    'Соглашение о расторжении',
    'ДС на пролонгацию',
    'Соглашение о штрафах',
    'Уведомление о факторинге',
  ];

  const DEVELOPMENT_CATEGORIES = ['СМР', 'ПИР', 'Оборудование и запчасти'];
  const CONDITIONS_STANDARD = ['Тип = Расходная, ВН = Нет', 'Тип = Иное, ВН = Нет'];
  const REQUEST_CLASSES = [
    { id: 'replace_people', label: 'Замена людей', score: 0.72, tests: [/замен|поменя|вместо|уволен|заблок|делегирован/i, /подписант|согласующ|спец.?эксперт|руководител|исполнител|пользовател/i] },
    { id: 'add_signer_forms', label: 'Добавить / изменить подписантов', score: 0.7, tests: [/подписант|подписание/i, /лимит|сумм|диапазон|до\s+\d|от\s+\d/i] },
    { id: 'add_doc_type', label: 'Типы документов', score: 0.68, tests: [/тип документ|изменение карточки|дс|спецификац/i, /добав|замен|удал|отсутств|найти/i] },
    { id: 'add_legal_entity', label: 'Добавить ЮЛ / ОП', score: 0.66, tests: [/добав|включ|расшир/i, /юр.?лиц|юл|оп|площадк|филиал|компан/i] },
    { id: 'create_category', label: 'Создать категорию / маршрут', score: 0.64, tests: [/созда|нов/i, /категор|маршрут|шаблон|прочие уровни/i] },
    { id: 'route_diagnostics', label: 'Маршрут не формируется / диагностика карточки', score: 0.74, tests: [/маршрут|лист согласован|карточк|робот|стандартн|красн/i, /не форм|не стро|ошиб|не тот|не видит|не проходит|отклон/i] },
    { id: 'constructor_issue', label: 'Конструктор / вложения', score: 0.62, tests: [/конструктор|вложен|протокол разноглас|передан/i, /не передан|не там|некоррект|не видит|ошиб/i] },
  ];

  const state = {
    original: {},
    installedApi: false,
    installedUi: false,
    lastPreview: null,
    lastOperation: null,
    lastRequestParse: null,
    logs: [],
  };

  function api() {
    return host.__OT_MATRIX_CLEANER__ || window.__OT_MATRIX_CLEANER__ || null;
  }

  function matrix() {
    return host.sc_ApprovalMatrix || window.sc_ApprovalMatrix || null;
  }

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/[«»"]/g, '')
      .replace(/[\u00A0\u2007]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function compact(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function unique(values) {
    const seen = new Set();
    const out = [];
    (values || []).forEach(value => {
      const text = compact(value);
      const key = normalize(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function parseList(value) {
    if (Array.isArray(value)) return unique(value);
    return unique(String(value || '').split(/[;,\n|]+/));
  }

  function stripId(value) {
    return compact(value).replace(/\s*\(\d+\)\s*$/, '');
  }

  function valueAsList(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (value && typeof value === 'object' && Array.isArray(value.performerList)) return value.performerList.map(String);
    if (value == null || value === '') return [];
    return [String(value)];
  }

  function extractLinks(text) {
    return unique(Array.from(String(text || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(match => match[0].replace(/[),.;]+$/, '')));
  }

  function extractAmounts(text) {
    return unique(Array.from(String(text || '').matchAll(/(?:от|до)?\s*(\d[\d\s.,]{3,})(?:\s*(?:руб|₽|млн|тыс))?/gi)).map(match => compact(match[0])));
  }

  function extractUsersFromText(text) {
    const out = [];
    const source = String(text || '');
    for (const match of source.matchAll(/\b[А-ЯЁ][а-яё-]+\s+[А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+)?\b/gu)) {
      const value = compact(match[0]);
      if (!/Группа Черкизово|Куриное Царство|Основной договор/i.test(value)) out.push(value);
    }
    for (const match of source.matchAll(/\b[А-ЯЁ][а-яё-]+\s+[А-ЯЁ]\.[А-ЯЁ]\./gu)) out.push(compact(match[0]));
    return unique(out).slice(0, 20);
  }

  function extractLegalEntitiesFromText(text) {
    const source = String(text || '');
    const out = [];
    for (const match of source.matchAll(/\b(?:ООО|АО|ОАО|ПАО|ЗАО|ТОО)\s+[«"]?[^,;:\n\r()]{2,80}/giu)) out.push(match[0]);
    for (const match of source.matchAll(/[«"]?(?:Черкизово|Куриное Царство|ПКХП|Тамбовская Индейка)[^,;:\n\r()]{0,80}/giu)) out.push(match[0]);
    return unique(out).slice(0, 30);
  }

  function extractDocTypesFromText(text) {
    const norm = normalize(text);
    const found = [];
    DOC_GROUP_A.concat(DOC_GROUP_B, ['Изменение карточки']).forEach(docType => {
      if (normalize(docType) && norm.includes(normalize(docType))) found.push(docType);
    });
    return unique(found);
  }

  function classifyRequestText(text) {
    const source = String(text || '');
    const hit = REQUEST_CLASSES.find(item => item.tests.every(regex => regex.test(source)));
    return hit || { id: 'manual_review', label: 'Нужно разобрать вручную', score: 0.35, tests: [] };
  }

  function getColumns() {
    const m = matrix();
    return m && Array.isArray(m.cols) ? m.cols : [];
  }

  function getItems() {
    const m = matrix();
    return m && Array.isArray(m.items) ? m.items : [];
  }

  function colIndex(aliases) {
    const wanted = (Array.isArray(aliases) ? aliases : [aliases]).map(normalize);
    return getColumns().findIndex(col => col && wanted.includes(normalize(col.alias || col.title || col.type || '')));
  }

  function namesForIds(ids, cache) {
    const source = cache || {};
    return (ids || []).map(id => {
      const abs = Math.abs(Number(id));
      return source[id] || source[abs] || String(id);
    });
  }

  function rowFacts() {
    const m = matrix();
    const cols = {
      partner: colIndex(['partner_id', 'partners_internal_id', 'Контрагент']),
      site: colIndex(['partner_op', 'site', 'op', 'Обособленное подразделение']),
      docType: colIndex(['document_type', 'Тип документа']),
      legalEntity: colIndex(['legal_entity', 'legal_entities', 'legal_entity_id', 'legal_entities_id', 'Юрлицо', 'Юр. лицо']),
      direction: colIndex(['direction', 'Дирекция']),
      functions: colIndex(['functions', 'Функция']),
      category: colIndex(['category', 'Категория']),
      conditions: colIndex(['condition', 'conditions', 'Условия применения']),
      edo: colIndex(['eds', 'edo', 'ЭДО', 'ЭЦП']),
      amount: colIndex(['amount', 'sum_rub', 'Сумма документа в рублях (включая налоги)']),
      limit: colIndex(['limit', 'limit_contract', 'Лимит по договору в рублях (без НДС)']),
    };
    return getItems().map((item, index) => {
      const docTypes = cols.docType >= 0 ? valueAsList(item[cols.docType]) : [];
      const legalEntities = cols.legalEntity >= 0 ? valueAsList(item[cols.legalEntity]) : [];
      const partnerIds = cols.partner >= 0 ? valueAsList(item[cols.partner]) : [];
      const partnerNames = m && m.partnerCacheObject ? namesForIds(partnerIds, m.partnerCacheObject) : partnerIds;
      const text = [
        docTypes.join('; '),
        legalEntities.join('; '),
        partnerNames.join('; '),
        cols.site >= 0 ? valueAsList(item[cols.site]).join('; ') : '',
        cols.direction >= 0 ? valueAsList(item[cols.direction]).join('; ') : '',
        cols.functions >= 0 ? valueAsList(item[cols.functions]).join('; ') : '',
        cols.category >= 0 ? valueAsList(item[cols.category]).join('; ') : '',
      ].join(' ');
      const norm = normalize(text);
      const groups = [];
      if (/основн|main/.test(norm)) groups.push('main_contract_rows');
      if (/(^|[\s;])дс($|[\s;])|доп|специфик|соглаш|supp/.test(norm)) groups.push('supplemental_rows');
      if (!groups.length) groups.push('custom');
      return {
        index,
        rowNumber: index + 1,
        docTypes,
        legalEntities,
        partnerNames,
        sites: cols.site >= 0 ? valueAsList(item[cols.site]) : [],
        directions: cols.direction >= 0 ? valueAsList(item[cols.direction]) : [],
        functions: cols.functions >= 0 ? valueAsList(item[cols.functions]) : [],
        categories: cols.category >= 0 ? valueAsList(item[cols.category]) : [],
        conditions: cols.conditions >= 0 ? valueAsList(item[cols.conditions]) : [],
        edo: cols.edo >= 0 ? valueAsList(item[cols.edo]) : [],
        amount: cols.amount >= 0 ? valueAsList(item[cols.amount]) : [],
        limit: cols.limit >= 0 ? valueAsList(item[cols.limit]) : [],
        groups,
        text,
      };
    });
  }

  function isNumericUser(value) {
    return /^-?\d{3,}$/.test(compact(value));
  }

  function userObject(value, role, source) {
    const raw = compact(value);
    const numeric = isNumericUser(raw);
    const id = numeric ? raw.replace(/^-/, '') : '';
    const fio = numeric ? `Не найдено имя (ID ${id})` : raw;
    return {
      id,
      fio,
      position: '',
      login: '',
      role: role || '',
      source: source || 'matrix',
      unresolved: numeric,
      display: fio,
    };
  }

  function uniqueUsers(values, role, source) {
    const seen = new Set();
    return (values || []).map(value => userObject(value, role, source)).filter(user => {
      const key = normalize(user.id || user.fio);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isSite(value, sites) {
    const text = compact(value);
    const key = normalize(text);
    return (sites || []).some(site => normalize(site) === key)
      || /(^|\s)[А-ЯЁA-Z][а-яёa-z-]+-\d+\b/.test(text)
      || /^(москва|липецк|воронеж|белгород|пенза|санкт-петербург|алтай|пермская)-\d+/i.test(text);
  }

  function isLegalEntity(value) {
    return /(^|[\s"«»])(ооо|ао|оао|пао|тоо|зао)(?=$|[\s"«»])/i.test(String(value || ''))
      || /группа\s+черкизово/i.test(String(value || ''));
  }

  const ContextDetector = {
    detect() {
      const bodyText = compact(document.body ? document.body.textContent : '');
      const title = document.title || '';
      const url = location.href;
      const m = matrix();
      let kind = 'unknown';
      if (m || document.querySelector('#sc_ApprovalMatrix')) kind = 'matrix';
      else if (/лист согласования/i.test(title) || document.querySelector('#ApprovalListForm')) kind = 'approval_list';
      else if (/assyst|itcm|itsm|инцидент/i.test(`${url} ${title} ${bodyText}`)) kind = 'itsm';
      else if (/zdoc|карточк|договор\s+отд|document/i.test(`${url} ${title} ${bodyText}`)) kind = 'card';
      else if (/ApprovalList|лист согласования/i.test(`${title} ${bodyText}`)) kind = 'approval_list';
      else if (document.querySelector('#browseViewCoreTable') && /OpenMatrix|матриц/i.test(bodyText)) kind = 'catalog';
      const statusNode = document.querySelector('#sc_approvalmatrixStatus, select[name*="status" i], [data-status]');
      const status = statusNode && statusNode.options && statusNode.selectedIndex >= 0
        ? statusNode.options[statusNode.selectedIndex].text
        : compact((statusNode && (statusNode.value || statusNode.textContent)) || (kind === 'matrix' ? 'Матрица' : ''));
      const matrixIdMatch = url.match(/[?&](?:matrixId|objId|nodeid)=([^&#]+)/i);
      return {
        kind,
        title: title || (kind === 'matrix' ? 'Матрица OpenText' : 'OpenText'),
        status: status || (kind === 'unknown' ? 'Контекст не определён' : kind),
        matrixId: matrixIdMatch ? decodeURIComponent(matrixIdMatch[1]) : '',
        urls: {
          current: url,
          card: Array.from(document.querySelectorAll('a[href*="zdoc"], a[href*="objId"]')).map(a => a.href).slice(0, 5),
          approvalList: Array.from(document.querySelectorAll('a[href*="ApprovalList"], a[href*="approvallist"]')).map(a => a.href).slice(0, 5),
          matrix: Array.from(document.querySelectorAll('a[href*="OpenMatrix"]')).map(a => a.href).slice(0, 5),
        },
      };
    },
  };

  const DictionaryBuilder = {
    build(options = {}) {
      const legacy = state.original.getHumanDictionaries && !options.skipLegacy
        ? state.original.getHumanDictionaries()
        : {};
      const facts = rowFacts();
      const m = matrix();
      const counterparties = unique([]
        .concat(legacy.counterparties || [])
        .concat(m && m.partnerCacheObject ? Object.keys(m.partnerCacheObject).map(id => m.partnerCacheObject[id]) : [])
        .concat(facts.flatMap(fact => fact.partnerNames)))
        .map(stripId)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ru'));
      const sites = unique([].concat(legacy.sites || []).concat(facts.flatMap(fact => fact.sites))).sort((a, b) => a.localeCompare(b, 'ru'));
      const inferredLegal = counterparties.filter(item => isLegalEntity(item) && !isSite(item, sites));
      const legalEntities = unique([].concat(legacy.legalEntities || []).concat(facts.flatMap(fact => fact.legalEntities)).concat(inferredLegal))
        .sort((a, b) => a.localeCompare(b, 'ru'));
      const usersRaw = []
        .concat(legacy.users || [])
        .concat(legacy.signers || [])
        .concat(legacy.approvers || [])
        .concat(legacy.specialExperts || [])
        .concat(legacy.performers || []);
      if (m && m.userCacheObject) {
        Object.keys(m.userCacheObject).forEach(id => usersRaw.push(m.userCacheObject[id] || id));
      }
      const users = uniqueUsers(usersRaw, 'matrix_user', 'matrix');
      const signers = uniqueUsers(legacy.signers || [], 'signer', 'matrix');
      const approvers = uniqueUsers(legacy.approvers || [], 'approver', 'matrix');
      const specialExperts = uniqueUsers(legacy.specialExperts || [], 'special_expert', 'matrix');
      return {
        schemaVersion: VERSION,
        refreshedAt: new Date().toISOString(),
        requiredAffiliation: REQUIRED_AFFILIATION,
        users,
        userDisplays: users.map(user => user.display),
        signers,
        approvers,
        specialExperts,
        performers: uniqueUsers(legacy.performers || [], 'performer', 'matrix'),
        signersAndApprovers: uniqueUsers([].concat(legacy.signers || []).concat(legacy.approvers || []), 'signer_or_approver', 'matrix'),
        counterparties,
        legalEntities,
        sites,
        docTypes: unique([].concat(legacy.docTypes || []).concat(facts.flatMap(fact => fact.docTypes)).concat(DOC_GROUP_A).concat(DOC_GROUP_B)).sort((a, b) => a.localeCompare(b, 'ru')),
        directions: unique([].concat(legacy.directions || []).concat(facts.flatMap(fact => fact.directions))).sort((a, b) => a.localeCompare(b, 'ru')),
        functions: unique([].concat(legacy.functions || []).concat(facts.flatMap(fact => fact.functions))).sort((a, b) => a.localeCompare(b, 'ru')),
        categories: unique([].concat(legacy.categories || []).concat(facts.flatMap(fact => fact.categories))).sort((a, b) => a.localeCompare(b, 'ru')),
        conditions: unique([].concat(facts.flatMap(fact => fact.conditions)).concat(CONDITIONS_STANDARD)).sort((a, b) => a.localeCompare(b, 'ru')),
        edo: unique([].concat(facts.flatMap(fact => fact.edo)).concat(['Единый ЭДО', 'Нет', 'ЭДО на внешней площадке'])).sort((a, b) => a.localeCompare(b, 'ru')),
        currencies: unique(facts.flatMap(fact => fact.text.match(/\bRUB\b|рубл[ьяей]*/ig) || [])),
        vatRates: unique(facts.flatMap(fact => fact.text.match(/НДС\s*\d+%?/ig) || [])),
        rowGroups: ['all', 'main_contract_rows', 'supplemental_rows', 'custom'],
        documentTypeGroups: {
          main_contract_rows: DOC_GROUP_A.slice(),
          supplemental_rows: DOC_GROUP_B.slice(),
        },
        developmentProjectCategories: DEVELOPMENT_CATEGORIES.slice(),
      };
    },
  };

  const UserResolver = {
    resolve(input, dictionaries) {
      const dict = dictionaries || DictionaryBuilder.build();
      const key = normalize(input);
      return (dict.users || []).find(user => normalize(user.fio) === key || normalize(user.display) === key || normalize(user.id) === key)
        || userObject(input, '', 'manual');
    },
  };

  const LegalEntityResolver = {
    parseList,
    resolve(input, dictionaries) {
      const dict = dictionaries || DictionaryBuilder.build();
      const legalEntities = [];
      const sites = [];
      const conflicts = [];
      const warnings = [];
      parseList(input).forEach(raw => {
        const text = stripId(raw);
        if (!text) return;
        if (isSite(text, dict.sites)) {
          sites.push(text);
          warnings.push(`"${text}" распознано как площадка/ОП и не будет добавлено в ЮЛ.`);
          return;
        }
        const exact = (dict.legalEntities || []).filter(item => normalize(item) === normalize(text));
        if (exact.length === 1) legalEntities.push(exact[0]);
        else if (exact.length > 1) conflicts.push({ input: text, candidates: exact });
        else if (isLegalEntity(text)) legalEntities.push(text);
        else {
          const near = (dict.legalEntities || []).filter(item => normalize(item).includes(normalize(text))).slice(0, 5);
          if (near.length === 1) legalEntities.push(near[0]);
          else conflicts.push({ input: text, candidates: near });
        }
      });
      return {
        affiliation: REQUIRED_AFFILIATION,
        legalEntities: unique(legalEntities),
        sites: unique(sites),
        conflicts,
        warnings,
      };
    },
  };

  const DocumentTypePresetEngine = {
    groups() {
      return {
        main_contract_rows: DOC_GROUP_A.slice(),
        supplemental_rows: DOC_GROUP_B.slice(),
      };
    },
  };

  const SignerFormsEngine = {
    build(payload = {}) {
      const signer = compact(payload.newSigner || payload.signer || '');
      const limit = compact(payload.limit || payload.rangeTo || '');
      const amount = compact(payload.amount || (payload.unifiedRanges !== false ? limit : ''));
      if (!signer || !limit || !amount) return [];
      const common = {
        newSigner: signer,
        currentSigner: compact(payload.currentSigner || ''),
        legalEntities: parseList(payload.legalEntities || payload.legalEntity || ''),
        sites: parseList(payload.sites || payload.site || ''),
        conditions: payload.conditions || CONDITIONS_STANDARD,
        affiliation: REQUIRED_AFFILIATION,
      };
      return [
        Object.assign({}, common, { rowKey: 'main_limit_edo', rowGroup: 'main_contract_rows', documentTypes: DOC_GROUP_A.slice(), edoMode: 'edo', valueMode: 'limit', value: limit }),
        Object.assign({}, common, { rowKey: 'main_limit_non_edo', rowGroup: 'main_contract_rows', documentTypes: DOC_GROUP_A.slice(), edoMode: 'non_edo', valueMode: 'limit', value: limit }),
        Object.assign({}, common, { rowKey: 'supp_amount_edo', rowGroup: 'supplemental_rows', documentTypes: DOC_GROUP_B.slice(), edoMode: 'edo', valueMode: 'amount', value: amount }),
        Object.assign({}, common, { rowKey: 'supp_amount_non_edo', rowGroup: 'supplemental_rows', documentTypes: DOC_GROUP_B.slice(), edoMode: 'non_edo', valueMode: 'amount', value: amount }),
      ];
    },
    toLegacyBundle(payload = {}) {
      const forms = SignerFormsEngine.build(payload);
      return {
        type: 'add_signer_bundle',
        payload: Object.assign({}, payload, {
          newSigner: compact(payload.newSigner || payload.signer || ''),
          limit: compact(payload.limit || payload.rangeTo || ''),
          amount: compact(payload.amount || payload.limit || payload.rangeTo || ''),
          affiliation: REQUIRED_AFFILIATION,
          signerForms: forms,
          documentTypeGroups: DocumentTypePresetEngine.groups(),
          conditions: payload.conditions || CONDITIONS_STANDARD,
        }),
        options: Object.assign({ sourceRule: 'opentext_toolkit_signer_forms' }, payload.options || {}),
      };
    },
  };

  const ChecklistEngine = {
    run(options = {}) {
      const target = api();
      if (target && state.original.runChecklistEngine) return state.original.runChecklistEngine(options);
      return {
        summary: { total: 1, pass: 0, warn: 1, fail: 0 },
        checks: [{ id: 'fallback', title: 'Проверка карточки', status: 'warn', recommendation: 'Базовый checklist runtime недоступен.' }],
      };
    },
  };

  const ITSMIntakeEngine = {
    parse(text = '') {
      const target = api();
      const raw = String(text || '');
      const parsed = target && state.original.parseRequestText ? state.original.parseRequestText(raw) : {};
      const classification = classifyRequestText(raw);
      const links = extractLinks(raw);
      const incident = raw.match(/\b(?:INC|#)?(\d{6,})\b/i);
      const users = unique([].concat(parsed.extracted ? parsed.extracted.users || [] : []).concat(extractUsersFromText(raw)));
      const legalEntities = unique([].concat(parsed.extracted ? parsed.extracted.legalEntities || [] : []).concat(extractLegalEntitiesFromText(raw)));
      const docTypes = unique([].concat(parsed.extracted ? parsed.extracted.docTypes || [] : []).concat(extractDocTypesFromText(raw)));
      const amounts = unique([].concat(parsed.extracted ? parsed.extracted.amounts || [] : []).concat(extractAmounts(raw)));
      const limits = unique([].concat(parsed.extracted ? parsed.extracted.limits || [] : []).concat(amounts));
      const missing = [];
      if (/signer|подпис/i.test(classification.id) || classification.id === 'add_signer_forms') {
        if (!users.length) missing.push('ФИО подписанта');
        if (!amounts.length) missing.push('диапазон суммы/лимита');
      }
      if (classification.id === 'add_doc_type' && !docTypes.length) missing.push('тип документа');
      if (classification.id === 'add_legal_entity' && !legalEntities.length) missing.push('ЮЛ / внутренняя компания');
      if (classification.id === 'route_diagnostics' && !links.length) missing.push('ссылка на карточку или лист согласования');
      const proposedOperations = [];
      if (classification.id === 'add_signer_forms') {
        proposedOperations.push({
          type: 'add_signer_forms',
          payload: {
            newSigner: users[0] || '',
            limit: amounts[0] || '',
            amount: amounts[0] || '',
            legalEntities,
            conditions: CONDITIONS_STANDARD,
            affiliation: REQUIRED_AFFILIATION,
          },
        });
      } else if (classification.id === 'add_doc_type') {
        proposedOperations.push({ type: 'add_doc_type_to_matching_rows', payload: { newDocType: docTypes[0] || '', requiredDocTypes: docTypes, matchMode: 'all', affiliation: REQUIRED_AFFILIATION } });
      } else if (classification.id === 'add_legal_entity') {
        proposedOperations.push({ type: 'add_legal_entity_to_matching_rows', payload: { legalEntity: legalEntities[0] || '', legalEntities, affiliation: REQUIRED_AFFILIATION } });
      } else if (classification.id === 'route_diagnostics' || classification.id === 'constructor_issue') {
        proposedOperations.push({ type: 'checklist_route_failure', payload: { rawText: raw, links } });
      } else if (classification.id === 'create_category') {
        proposedOperations.push({ type: 'create_category_from_template', payload: { rawText: raw, legalEntities, docTypes, affiliation: REQUIRED_AFFILIATION } });
      }
      return Object.assign({}, parsed, {
        caseType: parsed.caseType || classification.id,
        confidence: Math.max(Number(parsed.confidence) || 0, classification.score || 0),
        links,
        incidentId: incident ? incident[1] : '',
        missing,
        needsClarification: missing,
        proposedOperations: parsed.proposedOperations && parsed.proposedOperations.length ? parsed.proposedOperations : proposedOperations,
        suggestedFirstLineResponse: missing.length
          ? `Нужно уточнить: ${missing.join(', ')}.`
          : 'Данных достаточно для preview. Перед apply проверьте найденные строки и отчёт.',
        understood: {
          requestType: parsed.caseType || classification.label,
          users,
          legalEntities,
          docTypes,
          limits,
          amounts,
          links,
          incidentId: incident ? incident[1] : '',
        },
      });
    },
  };

  const CardDoctor = {
    diagnose(options = {}) {
      const target = api();
      if (target && state.original.diagnoseCurrentCard) return state.original.diagnoseCurrentCard(options);
      return ChecklistEngine.run(options);
    },
  };

  const ClosestMatchSearch = {
    find(criteria = {}) {
      const facts = rowFacts();
      const wanted = {
        direction: normalize(criteria.direction),
        functionName: normalize(criteria.functionName || criteria.function),
        category: normalize(criteria.category),
        legalEntity: normalize(criteria.legalEntity),
        docType: normalize(criteria.docType),
      };
      return facts.map(fact => {
        const diffs = [];
        let score = 0;
        if (wanted.direction) fact.directions.map(normalize).includes(wanted.direction) ? score += 3 : diffs.push('Дирекция');
        if (wanted.functionName) fact.functions.map(normalize).includes(wanted.functionName) ? score += 3 : diffs.push('Функция');
        if (wanted.category) fact.categories.map(normalize).includes(wanted.category) ? score += 2 : diffs.push('Категория');
        if (wanted.legalEntity) fact.legalEntities.map(normalize).includes(wanted.legalEntity) || fact.partnerNames.map(normalize).includes(wanted.legalEntity) ? score += 2 : diffs.push('ЮЛ');
        if (wanted.docType) fact.docTypes.map(normalize).includes(wanted.docType) ? score += 2 : diffs.push('Тип документа');
        return {
          rowNumber: fact.rowNumber,
          score,
          differs: diffs,
          summary: fact.text.slice(0, 240),
        };
      }).filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 15);
    },
  };

  const MatrixNavigator = {
    currentContext: () => ContextDetector.detect(),
    closestMatch: criteria => ClosestMatchSearch.find(criteria),
  };

  function translateOperation(operation) {
    const op = operation || {};
    if (op.type === 'add_signer_forms') return SignerFormsEngine.toLegacyBundle(op.payload || {});
    if (op.type === 'create_development_project') {
      return {
        type: 'add_signer_bundle',
        payload: {
          newSigner: op.payload && op.payload.signer || 'Уточнить подписанта',
          limit: op.payload && op.payload.limit || '30000000',
          amount: op.payload && op.payload.amount || op.payload && op.payload.limit || '30000000',
          categories: DEVELOPMENT_CATEGORIES.slice(),
          affiliation: REQUIRED_AFFILIATION,
        },
        options: { sourceRule: 'development_project_preview' },
      };
    }
    return op;
  }

  function normalizePreviewResult(result) {
    const out = result || {};
    const report = Array.isArray(out.report) ? out.report : [];
    out.entries = Array.isArray(out.entries) ? out.entries : report;
    out.warnings = Array.isArray(out.warnings)
      ? out.warnings
      : report.filter(row => /warn|manual|skip/i.test(String(row.status || row.actionType || '')));
    return out;
  }

  function log(message, level = 'info') {
    state.logs.push({ at: new Date().toISOString(), level, message: String(message || '') });
    if (state.logs.length > 250) state.logs.shift();
    const box = document.querySelector('[data-role="otk-log-box"]');
    if (box) {
      box.innerHTML = state.logs.slice(-80).map(item => `<div class="otk-log-line otk-log-${escapeHtml(item.level)}"><b>${escapeHtml(item.level)}</b> ${escapeHtml(item.message)}</div>`).join('');
      box.scrollTop = box.scrollHeight;
    }
  }

  function installApi() {
    let target = api();
    if (state.installedApi) return false;
    if (!target) {
      if (matrix() || document.querySelector('#sc_ApprovalMatrix')) return false;
      target = {};
      host.__OT_MATRIX_CLEANER__ = target;
      window.__OT_MATRIX_CLEANER__ = target;
    }
    state.original.preview = target.preview ? target.preview.bind(target) : null;
    state.original.apply = target.apply ? target.apply.bind(target) : null;
    state.original.previewRuleBatch = target.previewRuleBatch ? target.previewRuleBatch.bind(target) : null;
    state.original.runRuleBatch = target.runRuleBatch ? target.runRuleBatch.bind(target) : null;
    state.original.getHumanDictionaries = target.getHumanDictionaries ? target.getHumanDictionaries.bind(target) : null;
    state.original.exportReport = target.exportReport ? target.exportReport.bind(target) : null;
    state.original.searchAcrossMatrices = target.searchAcrossMatrices ? target.searchAcrossMatrices.bind(target) : null;
    state.original.diagnoseCurrentCard = target.diagnoseCurrentCard ? target.diagnoseCurrentCard.bind(target) : null;
    state.original.runChecklistEngine = target.runChecklistEngine ? target.runChecklistEngine.bind(target) : null;
    state.original.parseRequestText = target.parseRequestText ? target.parseRequestText.bind(target) : null;

    target.ContextDetector = ContextDetector;
    target.DictionaryBuilder = DictionaryBuilder;
    target.UserResolver = UserResolver;
    target.LegalEntityResolver = LegalEntityResolver;
    target.DocumentTypePresetEngine = DocumentTypePresetEngine;
    target.SignerFormsEngine = SignerFormsEngine;
    target.ChecklistEngine = ChecklistEngine;
    target.ITSMIntakeEngine = ITSMIntakeEngine;
    target.CardDoctor = CardDoctor;
    target.MatrixNavigator = MatrixNavigator;
    target.ClosestMatchSearch = ClosestMatchSearch;

    target.getToolkitContext = () => ContextDetector.detect();
    target.getHumanDictionaries = options => DictionaryBuilder.build(options || {});
    target.resolveLegalEntities = (input, dictionaries) => LegalEntityResolver.resolve(input, dictionaries);
    target.buildSignerForms = payload => SignerFormsEngine.build(payload || {});
    target.findClosestMatrixRows = criteria => ClosestMatchSearch.find(criteria || {});
    target.parseITSMIntake = text => ITSMIntakeEngine.parse(text || '');

    target.previewToolkit = async (operations, options = {}) => {
      const translated = (operations || []).map(translateOperation);
      if (!state.original.preview) throw new Error('Base preview API is unavailable.');
      const result = normalizePreviewResult(await state.original.preview(translated, options));
      state.lastPreview = result;
      return result;
    };

    target.preview = async (operations, options = {}) => target.previewToolkit(operations || [], options || {});
    target.previewRuleBatch = async (operations, options = {}) => {
      const translated = (operations || []).map(translateOperation);
      if (translated.length && translated.every(op => op.type !== 'add_signer_forms') && state.original.previewRuleBatch) {
        return state.original.previewRuleBatch(translated, options || {});
      }
      const result = await target.previewToolkit(translated, options || {});
      const report = (result.report || []).slice();
      report.planId = result.planId;
      return report;
    };

    target.runRuleBatch = async (operationsOrPlanId, options = {}) => {
      if (typeof operationsOrPlanId === 'string') {
        return state.original.apply ? (await state.original.apply(operationsOrPlanId, options || {})).report : [];
      }
      const result = await target.previewToolkit(operationsOrPlanId || [], options || {});
      return state.original.apply ? (await state.original.apply(result.planId, options || {})).report : result.report || [];
    };

    target.exportToolkitReport = format => {
      if (state.original.exportReport) return state.original.exportReport(format || 'json');
      return JSON.stringify({ report: state.lastPreview ? state.lastPreview.report : [] }, null, 2);
    };

    host.__OPENTEXT_TOOLKIT__ = target;
    host.MatrixCleaner = target;
    state.installedApi = true;
    return true;
  }

  function installStyles() {
    if (document.getElementById('otk-style')) return;
    const style = document.createElement('style');
    style.id = 'otk-style';
    style.textContent = `
      #mc-root.otk-clean > :not([data-role="otk-root"]) { display:none !important; }
      [data-role="otk-root"]{font-family:Arial,sans-serif;color:#111;background:#fff;border:1px solid #111;margin:0 0 10px;padding:0;max-width:960px}
      .otk-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid #ddd;background:#fff}
      .otk-title{font-size:15px;font-weight:700;line-height:1.2}.otk-sub{font-size:11px;color:#555;margin-top:2px}.otk-menu-wrap{position:relative}
      .otk-icon-btn{border:1px solid #aaa;background:#fff;color:#111;width:30px;height:28px;cursor:pointer;font-weight:700}
      .otk-menu{position:absolute;right:0;top:32px;background:#fff;border:1px solid #111;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:3;min-width:190px;padding:6px;display:grid;gap:4px}
      .otk-menu[hidden]{display:none}.otk-menu button{border:1px solid #ddd;background:#fff;text-align:left;padding:6px;font-size:12px;cursor:pointer}
      .otk-status{padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;display:flex;gap:8px;flex-wrap:wrap}.otk-pill{border:1px solid #ccc;background:#fafafa;padding:2px 6px;border-radius:8px}
      .otk-scenario{padding:10px 12px;border-bottom:1px solid #ddd;display:grid;gap:5px}.otk-scenario label{font-size:12px;font-weight:700}.otk-select,.otk-input,.otk-textarea{box-sizing:border-box;width:100%;border:1px solid #aaa;background:#fff;color:#111;padding:6px;font-size:12px}
      .otk-body{display:grid;grid-template-columns:minmax(0,1fr) 286px;gap:12px;padding:12px}.otk-left{min-width:0}.otk-right{position:sticky;top:12px;align-self:start;display:grid;gap:10px}
      .otk-card{border:1px solid #ddd;background:#fff;padding:10px;display:grid;gap:8px}.otk-card h3{font-size:13px;margin:0}.otk-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.otk-form label{display:grid;gap:3px;font-size:11px;color:#333}
      .otk-screen[hidden]{display:none}.otk-actions{display:flex;flex-wrap:wrap;gap:6px}.otk-actions button{border:1px solid #111;background:#111;color:#fff;padding:7px 9px;font-size:12px;cursor:pointer}.otk-actions button.secondary{background:#fff;color:#111}
      .otk-chips{display:flex;flex-wrap:wrap;gap:4px;min-height:24px}.otk-chip{border:1px solid #bbb;background:#f7f7f7;padding:3px 6px;border-radius:8px;font-size:11px;max-width:100%;overflow-wrap:anywhere}.otk-chip.warn{border-color:#a66;background:#fff1f1}
      .otk-kv{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eee;padding-bottom:4px}.otk-kv span{color:#555}.otk-kv strong{text-align:right}
      .otk-preview-list{display:grid;gap:6px;max-height:260px;overflow:auto}.otk-preview-row{border:1px solid #ddd;padding:6px;font-size:11px}.otk-preview-row.ok{border-left:4px solid #1f7a1f}.otk-preview-row.warn{border-left:4px solid #9a6a00}.otk-preview-row.skip{border-left:4px solid #777}
      .otk-log-drawer{border-top:1px solid #ddd;padding:8px 12px}.otk-log-body{border:1px solid #ddd;background:#fafafa;max-height:220px;overflow:auto;padding:6px;font-size:11px;margin-top:6px}.otk-log-line{padding:2px 0;border-bottom:1px solid #eee}
      .otk-range{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:6px}.otk-table{width:100%;border-collapse:collapse;font-size:11px}.otk-table th,.otk-table td{border:1px solid #ddd;padding:4px;text-align:left}
      .mc-v8-create-preview{margin-top:6px}
      @media(max-width:760px){.otk-body{grid-template-columns:1fr}.otk-right{position:static}.otk-form{grid-template-columns:1fr}.otk-head{display:block}.otk-menu-wrap{margin-top:6px}}
    `;
    document.head.appendChild(style);
  }

  function fillOptions(list, values) {
    if (!list) return;
    list.innerHTML = '';
    (values || []).slice(0, 700).forEach(value => {
      const option = document.createElement('option');
      option.value = typeof value === 'string' ? value : (value.display || value.fio || value.name || '');
      list.appendChild(option);
    });
  }

  function contextLabel(context) {
    if (context.kind === 'matrix') return `Матрица: ${context.title.replace(/^Матрица согласования:\s*/i, '')}`;
    if (context.kind === 'approval_list') return 'Лист согласования';
    if (context.kind === 'itsm') return 'ITSM заявка';
    if (context.kind === 'card') return 'Карточка договора';
    if (context.kind === 'catalog') return 'Каталог матриц';
    return 'OpenText';
  }

  function defaultScenario(context) {
    if (context.kind === 'itsm') return 'request';
    if (context.kind === 'card' || context.kind === 'approval_list') return 'doctor';
    if (context.kind === 'catalog') return 'search';
    return 'signers';
  }

  function screenTitle(id) {
    return {
      signers: 'Подписанты',
      approvers: 'Согласующие',
      doctypes: 'Типы документов',
      legal: 'ЮЛ и площадки',
      search: 'Поиск по матрицам',
      doctor: 'Проверка карточки',
      request: 'Разобрать заявку',
      test: 'Тестовый контур',
    }[id] || 'Подписанты';
  }

  function renderPreview(root, result) {
    const preview = normalizePreviewResult(result || {});
    state.lastPreview = preview;
    const summary = preview.summary || {};
    const count = key => summary[key] || 0;
    const box = root.querySelector('[data-role="otk-preview"]');
    const actions = root.querySelector('[data-role="otk-preview-actions"]');
    root.querySelector('[data-role="otk-plan-id"]').textContent = preview.planId || 'нет preview';
    root.querySelector('[data-role="otk-preview-summary"]').textContent =
      `создать: ${count('created') || (preview.entries || []).filter(row => row.actionType === 'add-row').length}; изменить: ${count('updated') || (preview.entries || []).filter(row => row.actionType === 'patch-row').length}; пропустить: ${count('skipped')}; warnings: ${(preview.warnings || []).length}`;
    box.innerHTML = (preview.entries || preview.report || []).slice(0, 18).map(row => {
      const cls = row.status === 'ok' ? 'ok' : row.status === 'skipped' || row.actionType === 'skip' ? 'skip' : 'warn';
      return `<div class="otk-preview-row ${cls}"><b>${escapeHtml(row.actionType || row.operationType || 'preview')}</b><div>${escapeHtml(row.reason || row.message || '')}</div><small>${escapeHtml(row.rowNo || row.itemId || '')}</small></div>`;
    }).join('') || '<div class="otk-preview-row warn">Preview пустой. Заполните форму и нажмите «Показать превью».</div>';
    actions.hidden = !preview.planId;
    log(`Preview: ${preview.planId || 'без planId'}, записей ${(preview.entries || []).length}`, 'info');
  }

  function addChip(container, text, warn) {
    if (!container || !text) return;
    const chip = document.createElement('span');
    chip.className = warn ? 'otk-chip warn' : 'otk-chip';
    chip.textContent = text;
    container.appendChild(chip);
  }

  function renderLegalResolution(root, resolved) {
    const legalBox = root.querySelector('[data-role="otk-legal-chips"]');
    const siteBox = root.querySelector('[data-role="otk-site-chips"]');
    const conflictBox = root.querySelector('[data-role="otk-conflict-chips"]');
    [legalBox, siteBox, conflictBox].forEach(box => { if (box) box.innerHTML = ''; });
    (resolved.legalEntities || []).forEach(item => addChip(legalBox, item));
    (resolved.sites || []).forEach(item => addChip(siteBox, item, true));
    (resolved.warnings || []).forEach(item => addChip(conflictBox, item, true));
    (resolved.conflicts || []).forEach(item => addChip(conflictBox, `${item.input}: уточнить`, true));
  }

  function activeScreen(root) {
    return root.querySelector('[data-role="otk-scenario"]').value;
  }

  function buildOperation(root) {
    const scenario = activeScreen(root);
    const dict = DictionaryBuilder.build();
    const field = role => root.querySelector(`[data-role="${role}"]`);
    const common = {
      rowGroup: field('otk-row-group') ? field('otk-row-group').value : 'all',
      matchMode: field('otk-match-mode') ? field('otk-match-mode').value : 'all',
      affiliation: REQUIRED_AFFILIATION,
    };
    if (scenario === 'signers') {
      return {
        type: 'add_signer_forms',
        payload: Object.assign({}, common, {
          currentSigner: field('otk-current-signer').value,
          newSigner: field('otk-new-signer').value,
          limit: field('otk-range-to').value,
          amount: field('otk-unified-range').checked ? field('otk-range-to').value : field('otk-amount-to').value,
          legalEntities: field('otk-legal-input').value,
          sites: field('otk-site-input').value,
          conditions: CONDITIONS_STANDARD,
          documentTypeGroups: DocumentTypePresetEngine.groups(),
        }),
      };
    }
    if (scenario === 'approvers') {
      return {
        type: field('otk-approver-mode').value,
        payload: Object.assign({}, common, {
          currentApprover: field('otk-current-user').value,
          newApprover: field('otk-new-user').value,
          role: field('otk-approver-role').value,
          legalEntity: field('otk-approver-legal').value,
        }),
      };
    }
    if (scenario === 'doctypes') {
      return {
        type: field('otk-doc-mode').value,
        payload: Object.assign({}, common, {
          rowGroup: field('otk-doc-row-group').value,
          requiredDocTypes: parseList(field('otk-required-doc-types').value),
          matchMode: field('otk-match-mode').value,
          newDocType: field('otk-new-doc-type').value,
          changeCardFlag: 'Ранее не подписан',
        }),
      };
    }
    if (scenario === 'legal') {
      const resolved = LegalEntityResolver.resolve(field('otk-legal-paste').value, dict);
      renderLegalResolution(root, resolved);
      return {
        type: 'add_legal_entity_to_matching_rows',
        payload: Object.assign({}, common, {
          rowGroup: field('otk-legal-row-group').value,
          legalEntity: resolved.legalEntities[0] || field('otk-legal-paste').value,
          legalEntities: resolved.legalEntities,
          sites: resolved.sites,
          requiredDocTypes: parseList(field('otk-legal-required-docs').value),
          matchMode: field('otk-match-mode').value,
        }),
      };
    }
    if (scenario === 'test') {
      return { type: 'add_signer_forms', payload: { newSigner: 'Тестовый Подписант', limit: '1000', amount: '1000', affiliation: REQUIRED_AFFILIATION } };
    }
    return { type: 'checklist_card_validation', payload: { rawText: document.body ? document.body.textContent : '' } };
  }

  function showScreen(root, id) {
    root.querySelectorAll('[data-screen]').forEach(screen => {
      screen.hidden = screen.getAttribute('data-screen') !== id;
    });
    root.querySelector('[data-role="otk-active-title"]').textContent = screenTitle(id);
  }

  function installUi() {
    const target = api();
    const root = document.querySelector('#mc-root');
    if (!target || !root) return false;
    if (root.querySelector('[data-role="otk-root"]')) return true;
    installStyles();
    const dict = DictionaryBuilder.build();
    const context = ContextDetector.detect();
    root.classList.add('otk-clean');
    const shell = document.createElement('section');
    shell.setAttribute('data-role', 'otk-root');
    shell.innerHTML = `
      <div class="otk-head">
        <div><div class="otk-title">OpenText Toolkit</div><div class="otk-sub">Контекст: ${escapeHtml(contextLabel(context))}</div></div>
        <div class="otk-menu-wrap">
          <button type="button" class="otk-icon-btn" data-role="otk-menu-button" title="Меню">...</button>
          <div class="otk-menu" data-role="otk-menu" hidden>
            <button type="button" data-role="otk-show-logs">Логи</button>
            <button type="button" data-role="otk-export-json">Экспорт JSON</button>
            <button type="button" data-role="otk-export-csv">Экспорт CSV</button>
            <button type="button" data-role="otk-refresh-dicts">Обновить словари</button>
            <button type="button" data-role="otk-show-legacy">Debug / Legacy</button>
            <button type="button" data-role="otk-about">О программе</button>
          </div>
        </div>
      </div>
      <div class="otk-status">
        <span class="otk-pill">${escapeHtml(context.kind)}</span>
        <span class="otk-pill">${escapeHtml(context.status || 'статус не найден')}</span>
        <span class="otk-pill">ЮЛ: ${dict.legalEntities.length}</span>
        <span class="otk-pill">Пользователи: ${dict.users.length}</span>
      </div>
      <div class="otk-scenario">
        <label>Что делаем?</label>
        <select class="otk-select" data-role="otk-scenario">
          <option value="signers">Подписанты</option>
          <option value="approvers">Согласующие</option>
          <option value="doctypes">Типы документов</option>
          <option value="legal">ЮЛ и площадки</option>
          <option value="search">Поиск по матрицам</option>
          <option value="doctor">Проверка карточки</option>
          <option value="request">Разобрать заявку</option>
          <option value="test">Тестовый контур</option>
        </select>
      </div>
      <div class="otk-body">
        <div class="otk-left">
          <div class="otk-card"><h3 data-role="otk-active-title">Подписанты</h3>
            <div data-screen="signers" class="otk-screen">
              <div class="otk-form">
                <label>Новый подписант<input class="otk-input" data-role="otk-new-signer" list="otk-users"></label>
                <label>Текущий подписант<input class="otk-input" data-role="otk-current-signer" list="otk-users"></label>
                <label>ЮЛ / внутренняя компания<input class="otk-input" data-role="otk-legal-input" list="otk-legal"></label>
                <label>Площадка / ОП<input class="otk-input" data-role="otk-site-input" list="otk-sites"></label>
                <label>Дирекция<input class="otk-input" data-role="otk-direction" list="otk-directions"></label>
                <label>Функция<input class="otk-input" data-role="otk-function" list="otk-functions"></label>
                <label>Категория<input class="otk-input" data-role="otk-category" list="otk-categories"></label>
                <label>Условия применения<input class="otk-input" value="${escapeHtml(CONDITIONS_STANDARD.join('; '))}" readonly></label>
              </div>
              <div class="otk-card"><h3>Диапазоны подписания</h3>
                <div class="otk-range"><input class="otk-input" data-role="otk-range-from" value="0"><input class="otk-input" data-role="otk-range-to" placeholder="До"><input class="otk-input" data-role="otk-range-signer" list="otk-users" placeholder="Подписант"></div>
                <label><input type="checkbox" data-role="otk-unified-range" checked> Применять эти диапазоны и как лимит, и как сумму</label>
                <div data-role="otk-split-ranges" hidden><input class="otk-input" data-role="otk-amount-to" placeholder="Сумма до"></div>
                <div class="otk-chips"><span class="otk-chip">4 формы стандарт</span><span class="otk-chip">Основной пакет</span><span class="otk-chip">Подчинённый пакет</span></div>
              </div>
            </div>
            <div data-screen="approvers" class="otk-screen" hidden>
              <div class="otk-form">
                <label>Режим<select class="otk-select" data-role="otk-approver-mode"><option value="replace_approver">Замена согласующего</option><option value="replace_special_expert">Замена спецэксперта</option><option value="replace_manager">Замена руководителя</option><option value="remove_approver">Удаление согласующего</option></select></label>
                <label>Роль<input class="otk-input" data-role="otk-approver-role"></label>
                <label>Текущий пользователь<input class="otk-input" data-role="otk-current-user" list="otk-users"></label>
                <label>Новый пользователь<input class="otk-input" data-role="otk-new-user" list="otk-users"></label>
                <label>ЮЛ<input class="otk-input" data-role="otk-approver-legal" list="otk-legal"></label>
              </div>
            </div>
            <div data-screen="doctypes" class="otk-screen" hidden>
              <div class="otk-form">
                <label>Что делаем<select class="otk-select" data-role="otk-doc-mode"><option value="add_doc_type_to_matching_rows">Добавить тип документа</option><option value="add_doc_type_to_matching_rows">Заменить тип документа</option><option value="add_change_card_flag_to_matching_rows">Добавить "Изменение карточки"</option></select></label>
                <label>Где искать<select class="otk-select" data-role="otk-doc-row-group"><option value="all">Все строки</option><option value="main_contract_rows">Основной пакет</option><option value="supplemental_rows">Подчинённый пакет</option><option value="custom">Custom</option></select></label>
                <label>Что уже должно быть<input class="otk-input" data-role="otk-required-doc-types" list="otk-docs"></label>
                <label>Match<select class="otk-select" data-role="otk-match-mode"><option value="all">ВСЕ выбранные</option><option value="any">ЛЮБОЙ выбранный</option></select></label>
                <label>Новый тип документа<input class="otk-input" data-role="otk-new-doc-type" list="otk-docs"></label>
              </div>
            </div>
            <div data-screen="legal" class="otk-screen" hidden>
              <div class="otk-form">
                <label>ЮЛ списком<textarea class="otk-textarea" data-role="otk-legal-paste" rows="4" placeholder="Черкизово-Масла, Куриное Царство, ПКХП..."></textarea></label>
                <label>Куда добавить<select class="otk-select" data-role="otk-legal-row-group"><option value="all">Все найденные строки</option><option value="main_contract_rows">Основной пакет</option><option value="supplemental_rows">Подчинённый пакет</option></select></label>
                <label>Фильтр по типам документов<input class="otk-input" data-role="otk-legal-required-docs" list="otk-docs"></label>
              </div>
              <div class="otk-actions"><button type="button" class="secondary" data-role="otk-recognize-legal">Распознать список</button></div>
              <div><b>ЮЛ</b><div class="otk-chips" data-role="otk-legal-chips"></div></div>
              <div><b>Площадки / ОП</b><div class="otk-chips" data-role="otk-site-chips"></div></div>
              <div><b>Уточнить</b><div class="otk-chips" data-role="otk-conflict-chips"></div></div>
            </div>
            <div data-screen="search" class="otk-screen" hidden>
              <div class="otk-form">
                <label>Что ищем<select class="otk-select" data-role="otk-search-type"><option value="legal_entity">ЮЛ</option><option value="site">Площадку/ОП</option><option value="user">Пользователя</option><option value="signer">Подписанта</option><option value="approver">Согласующего</option><option value="doc_type">Тип документа</option><option value="category">Категорию</option></select></label>
                <label>Значение<input class="otk-input" data-role="otk-search-query"></label>
                <label>Режим<select class="otk-select" data-role="otk-search-match"><option value="partial">частичное</option><option value="exact">точное</option><option value="fuzzy">fuzzy</option></select></label>
                <label>Область<select class="otk-select" data-role="otk-search-scope"><option value="catalog">все матрицы</option><option value="current">текущая матрица</option></select></label>
              </div>
              <div data-role="otk-search-result"></div>
            </div>
            <div data-screen="doctor" class="otk-screen" hidden>
              <textarea class="otk-textarea" data-role="otk-doctor-text" rows="6" placeholder="Текст карточки, ошибки или листа согласования"></textarea>
              <div data-role="otk-doctor-result"></div>
            </div>
            <div data-screen="request" class="otk-screen" hidden>
              <textarea class="otk-textarea" data-role="otk-request-text" rows="8" placeholder="Вставь текст заявки или письма"></textarea>
              <div data-role="otk-request-result"></div>
            </div>
            <div data-screen="test" class="otk-screen" hidden>
              <div class="otk-form"><label>Режим<select class="otk-select" data-role="otk-test-mode"><option value="preview_only">preview_only</option><option value="real_insert">real_insert</option></select></label></div>
              <div data-role="otk-test-result"></div>
            </div>
            <datalist id="otk-users"></datalist><datalist id="otk-legal"></datalist><datalist id="otk-sites"></datalist><datalist id="otk-docs"></datalist><datalist id="otk-directions"></datalist><datalist id="otk-functions"></datalist><datalist id="otk-categories"></datalist>
            <div class="otk-actions">
              <button type="button" data-role="otk-build">Собрать формы</button>
              <button type="button" data-role="otk-preview-button">Показать превью</button>
              <button type="button" data-role="otk-apply-button">Применить</button>
              <button type="button" class="secondary" data-role="otk-clear-button">Очистить</button>
            </div>
          </div>
        </div>
        <aside class="otk-right">
          <div class="otk-card"><h3>Контекст</h3><div>${escapeHtml(contextLabel(context))}</div><div>${escapeHtml(context.status || '')}</div><div>Найдено: ЮЛ ${dict.legalEntities.length}, ОП ${dict.sites.length}, пользователей ${dict.users.length}</div></div>
          <div class="otk-card"><h3>Превью</h3><div>planId: <span data-role="otk-plan-id">нет preview</span></div><div data-role="otk-preview-summary">будет создано: 0; будет изменено: 0; будет пропущено: 0</div><div class="otk-preview-list" data-role="otk-preview"></div></div>
          <div class="otk-card" data-role="otk-preview-actions" hidden><h3>Действия</h3><div class="otk-actions"><button type="button" data-role="otk-apply-side">Применить</button><button type="button" class="secondary" data-role="otk-export-side">Экспорт отчёта</button></div></div>
        </aside>
      </div>
      <div class="otk-log-drawer">
        <button type="button" class="otk-icon-btn" data-role="otk-log-toggle" title="Показать логи">⌄</button> <b>Показать логи</b>
        <div class="otk-log-body" data-role="otk-log-panel" hidden>
          <div class="otk-actions"><button type="button" class="secondary" data-role="otk-copy-logs">Export logs</button><button type="button" class="secondary" data-role="otk-show-raw">Raw plan</button></div>
          <div data-role="otk-log-box"></div>
          <pre data-role="otk-raw-plan" hidden></pre>
        </div>
      </div>
    `;
    root.prepend(shell);

    fillOptions(shell.querySelector('#otk-users'), dict.users);
    fillOptions(shell.querySelector('#otk-legal'), dict.legalEntities);
    fillOptions(shell.querySelector('#otk-sites'), dict.sites);
    fillOptions(shell.querySelector('#otk-docs'), dict.docTypes);
    fillOptions(shell.querySelector('#otk-directions'), dict.directions);
    fillOptions(shell.querySelector('#otk-functions'), dict.functions);
    fillOptions(shell.querySelector('#otk-categories'), dict.categories);

    const scenario = shell.querySelector('[data-role="otk-scenario"]');
    scenario.value = defaultScenario(context);
    showScreen(shell, scenario.value);
    scenario.addEventListener('change', () => showScreen(shell, scenario.value));

    shell.querySelector('[data-role="otk-menu-button"]').addEventListener('click', () => {
      const menu = shell.querySelector('[data-role="otk-menu"]');
      menu.hidden = !menu.hidden;
    });
    shell.querySelector('[data-role="otk-show-legacy"]').addEventListener('click', () => {
      root.classList.remove('otk-clean');
      log('Legacy/debug panels shown from menu.', 'warn');
    });
    shell.querySelector('[data-role="otk-about"]').addEventListener('click', () => {
      log('OpenText Toolkit. Автор: Артём Шаповалов / ShapArt.', 'info');
    });
    shell.querySelector('[data-role="otk-refresh-dicts"]').addEventListener('click', () => {
      const fresh = DictionaryBuilder.build({ refresh: true });
      fillOptions(shell.querySelector('#otk-users'), fresh.users);
      fillOptions(shell.querySelector('#otk-legal'), fresh.legalEntities);
      fillOptions(shell.querySelector('#otk-sites'), fresh.sites);
      fillOptions(shell.querySelector('#otk-docs'), fresh.docTypes);
      log(`Словари обновлены: ЮЛ ${fresh.legalEntities.length}, пользователи ${fresh.users.length}.`, 'info');
    });
    shell.querySelector('[data-role="otk-unified-range"]').addEventListener('change', event => {
      shell.querySelector('[data-role="otk-split-ranges"]').hidden = event.target.checked;
    });
    shell.querySelector('[data-role="otk-recognize-legal"]').addEventListener('click', () => {
      const resolved = LegalEntityResolver.resolve(shell.querySelector('[data-role="otk-legal-paste"]').value, DictionaryBuilder.build());
      renderLegalResolution(shell, resolved);
      log(`Распознано ЮЛ ${resolved.legalEntities.length}, ОП ${resolved.sites.length}, конфликтов ${resolved.conflicts.length}.`, resolved.conflicts.length ? 'warn' : 'info');
    });
    shell.querySelector('[data-role="otk-build"]').addEventListener('click', () => {
      state.lastOperation = buildOperation(shell);
      log(`Собран сценарий: ${screenTitle(activeScreen(shell))}.`, 'info');
      if (activeScreen(shell) === 'signers') {
        renderPreview(shell, { report: SignerFormsEngine.build(state.lastOperation.payload).map((form, index) => ({
          actionType: 'add-row',
          status: 'ok',
          rowNo: `new-${index + 1}`,
          reason: `Форма ${index + 1}: ${form.rowGroup}, ${form.edoMode}, ${form.valueMode}=${form.value}.`,
        })), entries: [] });
      }
    });
    shell.querySelector('[data-role="otk-preview-button"]').addEventListener('click', async () => {
      const id = activeScreen(shell);
      if (id === 'search') {
        const result = await target.searchAcrossMatrices(shell.querySelector('[data-role="otk-search-query"]').value, {
          mode: shell.querySelector('[data-role="otk-search-type"]').value,
          matchMode: shell.querySelector('[data-role="otk-search-match"]').value,
        });
        shell.querySelector('[data-role="otk-search-result"]').innerHTML = `<table class="otk-table"><tr><th>Матрица</th><th>Строка</th><th>Найдено</th></tr>${(result.deduped || []).slice(0, 20).map(row => `<tr><td>${escapeHtml(row.matrixName)}</td><td>${escapeHtml(row.rowNumber)}</td><td>${escapeHtml(row.matchedValue)}</td></tr>`).join('')}</table>`;
        log(`Поиск: просканировано ${result.progress ? result.progress.scanned : 0}, найдено ${result.total}.`, 'info');
        return;
      }
      if (id === 'doctor') {
        const diagnosis = CardDoctor.diagnose({ text: shell.querySelector('[data-role="otk-doctor-text"]').value });
        shell.querySelector('[data-role="otk-doctor-result"]').innerHTML = `<div class="otk-card"><b>Что нашли</b><div>${escapeHtml(diagnosis.recommendation || diagnosis.suggestedFirstLineScript || 'Проверка завершена.')}</div></div>`;
        log('Card Doctor завершил проверку.', 'info');
        return;
      }
      if (id === 'request') {
        const parsed = ITSMIntakeEngine.parse(shell.querySelector('[data-role="otk-request-text"]').value);
        state.lastRequestParse = parsed;
        const understood = parsed.understood || {};
        const line = items => (items && items.length ? items.map(item => `<span class="otk-chip">${escapeHtml(item)}</span>`).join('') : '<span class="otk-chip warn">не найдено</span>');
        shell.querySelector('[data-role="otk-request-result"]').innerHTML = `
          <div class="otk-card">
            <b>Я понял</b>
            <div class="otk-kv"><span>Тип запроса</span><strong>${escapeHtml(understood.requestType || parsed.caseType || 'manual_review')}</strong></div>
            <div class="otk-kv"><span>Уверенность</span><strong>${escapeHtml(Math.round((parsed.confidence || 0) * 100))}%</strong></div>
            <div><small>Пользователи</small><div class="otk-chips">${line(understood.users)}</div></div>
            <div><small>ЮЛ / компании</small><div class="otk-chips">${line(understood.legalEntities)}</div></div>
            <div><small>Типы документов</small><div class="otk-chips">${line(understood.docTypes)}</div></div>
            <div><small>Суммы / лимиты</small><div class="otk-chips">${line((understood.amounts || []).concat(understood.limits || []))}</div></div>
            <div><small>Ссылки</small><div class="otk-chips">${line(understood.links)}</div></div>
          </div>
          <div class="otk-card">
            <b>Нужно уточнить</b>
            <div class="otk-chips">${line(parsed.needsClarification || parsed.missing || [])}</div>
            <small>${escapeHtml(parsed.suggestedFirstLineResponse || '')}</small>
          </div>
          <div class="otk-card">
            <b>Предлагаемое действие</b>
            <div>${escapeHtml((parsed.proposedOperations || []).map(op => op.type).join(', ') || 'manual_review')}</div>
          </div>`;
        if (parsed.proposedOperations && parsed.proposedOperations.length) renderPreview(shell, await target.previewToolkit(parsed.proposedOperations));
        log('Заявка разобрана.', 'info');
        return;
      }
      if (id === 'test') {
        const mode = shell.querySelector('[data-role="otk-test-mode"]').value;
        const result = await target.runSyntheticContour({ mode });
        shell.querySelector('[data-role="otk-test-result"]').textContent = `OK=${result.ok}, FAIL=${result.fail}, всего=${result.total}`;
        log(`Тестовый контур: OK=${result.ok}, FAIL=${result.fail}.`, result.fail ? 'warn' : 'info');
        return;
      }
      state.lastOperation = buildOperation(shell);
      renderPreview(shell, await target.previewToolkit([state.lastOperation]));
    });
    const applyLatest = async () => {
      if (!state.lastPreview || !state.lastPreview.planId) {
        log('Apply заблокирован: сначала нужен preview.', 'warn');
        return;
      }
      const result = await target.apply(state.lastPreview.planId);
      renderPreview(shell, result);
      log(`Apply завершён: ${(result.report || []).length} записей.`, 'info');
    };
    shell.querySelector('[data-role="otk-apply-button"]').addEventListener('click', applyLatest);
    shell.querySelector('[data-role="otk-apply-side"]').addEventListener('click', applyLatest);
    shell.querySelector('[data-role="otk-clear-button"]').addEventListener('click', () => {
      if (target.clearPreview) target.clearPreview();
      state.lastPreview = null;
      renderPreview(shell, { report: [], entries: [] });
      log('Preview очищен.', 'info');
    });
    shell.querySelector('[data-role="otk-export-side"]').addEventListener('click', () => {
      const text = target.exportToolkitReport ? target.exportToolkitReport('html') : '';
      log(`Экспорт отчёта подготовлен (${text.length} символов).`, 'info');
    });
    shell.querySelector('[data-role="otk-export-json"]').addEventListener('click', () => log((target.exportToolkitReport ? target.exportToolkitReport('json') : '').slice(0, 800), 'info'));
    shell.querySelector('[data-role="otk-export-csv"]').addEventListener('click', () => log((target.exportToolkitReport ? target.exportToolkitReport('csv') : '').slice(0, 800), 'info'));
    shell.querySelector('[data-role="otk-log-toggle"]').addEventListener('click', () => {
      const panel = shell.querySelector('[data-role="otk-log-panel"]');
      panel.hidden = !panel.hidden;
    });
    shell.querySelector('[data-role="otk-show-logs"]').addEventListener('click', () => {
      shell.querySelector('[data-role="otk-log-panel"]').hidden = false;
      shell.querySelector('[data-role="otk-menu"]').hidden = true;
    });
    shell.querySelector('[data-role="otk-show-raw"]').addEventListener('click', () => {
      const raw = shell.querySelector('[data-role="otk-raw-plan"]');
      raw.hidden = !raw.hidden;
      raw.textContent = JSON.stringify(state.lastPreview || {}, null, 2);
    });
    shell.querySelector('[data-role="otk-copy-logs"]').addEventListener('click', async () => {
      const text = JSON.stringify(state.logs, null, 2);
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
      log('Логи экспортированы в буфер обмена.', 'info');
    });

    log(`Toolkit loaded: ${contextLabel(context)}.`, 'info');
    state.installedUi = true;
    return true;
  }

  function install() {
    const okApi = installApi();
    const okUi = installUi();
    return okApi && okUi;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 30000);
})();
