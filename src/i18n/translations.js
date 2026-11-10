import { defaultLanguage } from '../contexts/languageContext.js'

// Interface text for every supported language. Keys must stay identical
// between languages; Arabic is the reference (default) language.
export const translations = Object.freeze({
  ar: {
    app: {
      name: 'AIDP',
      tagline: 'المعالجة الذكية للمستندات العربية',
    },
    a11y: {
      skipToContent: 'الانتقال إلى المحتوى الرئيسي',
    },
    common: {
      comingSoon: 'قريبًا',
      underDevelopment: 'قيد التطوير',
      demoData: 'بيانات تجريبية',
      backToDashboard: 'العودة إلى لوحة التحكم',
    },
    nav: {
      ariaLabel: 'القائمة الرئيسية',
      openMenu: 'فتح القائمة',
      closeMenu: 'إغلاق القائمة',
      sections: {
        main: 'مساحة العمل',
        system: 'النظام',
      },
      dashboard: 'لوحة التحكم',
      upload: 'رفع مستند',
      archive: 'أرشيف المستندات',
      corrections: 'مستندات تحتاج إلى تصحيح',
      templates: 'قوالب المستندات',
      settings: 'الإعدادات',
      logout: 'تسجيل الخروج',
    },
    header: {
      language: 'لغة الواجهة',
      notifications: 'الإشعارات',
      notificationsPlaceholder: 'الإشعارات (قريبًا)',
      currentUser: 'المستخدم الحالي',
    },
    roles: {
      employee: 'موظف',
      orgAdmin: 'مدير المؤسسة',
    },
    demoUser: {
      name: 'مستخدم تجريبي',
      initials: 'م ت',
    },
    dashboard: {
      welcomeTitle: 'مرحبًا بك، {name}',
      welcomeSubtitle:
        'من هنا يمكنك رفع المستندات ومتابعة حالتها وإدارتها في مكان واحد.',
      uploadCta: 'رفع مستند جديد',
      overview: 'ملخص المستندات',
      stats: {
        total: 'إجمالي المستندات',
        completed: 'المستندات المكتملة',
        needsCorrection: 'مستندات تحتاج إلى تصحيح',
        awaitingProcessing: 'مستندات بانتظار المعالجة',
      },
      demoNote:
        'الأرقام المعروضة بيانات تجريبية لأغراض العرض فقط، ولا تمثل مستندات حقيقية.',
    },
    pages: {
      placeholderHint:
        'هذه الصفحة جزء من الهيكل الأولي للتطبيق، وسيتم بناء وظائفها في المراحل القادمة.',
      upload: {
        description: 'ستتيح هذه الصفحة رفع المستندات لمعالجتها لاحقًا.',
      },
      archive: {
        description: 'ستعرض هذه الصفحة المستندات المحفوظة مع إمكانية البحث والتصفية.',
      },
      corrections: {
        description: 'ستعرض هذه الصفحة المستندات التي تحتاج إلى مراجعة وتصحيح من الموظف.',
      },
      templates: {
        description: 'ستتيح هذه الصفحة إدارة قوالب المستندات المعتمدة في المؤسسة.',
      },
      settings: {
        description: 'ستتيح هذه الصفحة إدارة إعدادات الحساب وتفضيلات النظام.',
      },
      notFound: {
        title: 'الصفحة غير موجودة',
        description: 'تعذر العثور على الصفحة المطلوبة. تحقق من الرابط أو عد إلى لوحة التحكم.',
      },
    },
  },
  en: {
    app: {
      name: 'AIDP',
      tagline: 'Arabic Intelligent Document Processing',
    },
    a11y: {
      skipToContent: 'Skip to main content',
    },
    common: {
      comingSoon: 'Soon',
      underDevelopment: 'Under development',
      demoData: 'Demo data',
      backToDashboard: 'Back to dashboard',
    },
    nav: {
      ariaLabel: 'Main navigation',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      sections: {
        main: 'Workspace',
        system: 'System',
      },
      dashboard: 'Dashboard',
      upload: 'Upload Document',
      archive: 'Document Archive',
      corrections: 'Documents Requiring Correction',
      templates: 'Document Templates',
      settings: 'Settings',
      logout: 'Logout',
    },
    header: {
      language: 'Interface language',
      notifications: 'Notifications',
      notificationsPlaceholder: 'Notifications (coming soon)',
      currentUser: 'Current user',
    },
    roles: {
      employee: 'Employee',
      orgAdmin: 'Organization Administrator',
    },
    demoUser: {
      name: 'Demo User',
      initials: 'DU',
    },
    dashboard: {
      welcomeTitle: 'Welcome, {name}',
      welcomeSubtitle: 'Upload documents, follow their status, and manage them in one place.',
      uploadCta: 'Upload new document',
      overview: 'Documents overview',
      stats: {
        total: 'Total documents',
        completed: 'Completed documents',
        needsCorrection: 'Documents requiring correction',
        awaitingProcessing: 'Documents awaiting processing',
      },
      demoNote:
        'The figures shown are demo data for display purposes only and do not represent real documents.',
    },
    pages: {
      placeholderHint:
        'This page is part of the initial application shell. Its functionality will be built in upcoming phases.',
      upload: {
        description: 'This page will let you upload documents for later processing.',
      },
      archive: {
        description: 'This page will list stored documents with search and filtering.',
      },
      corrections: {
        description: 'This page will list documents that need review and correction by an employee.',
      },
      templates: {
        description: "This page will let you manage the organization's approved document templates.",
      },
      settings: {
        description: 'This page will let you manage account settings and system preferences.',
      },
      notFound: {
        title: 'Page not found',
        description:
          'The requested page could not be found. Check the link or return to the dashboard.',
      },
    },
  },
})

function lookup(dictionary, key) {
  return key
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary)
}

// Resolves a dotted key (e.g. "nav.dashboard") for a language, falling back to
// the default language, then to the key itself. "{name}" placeholders are
// replaced with values from `params`.
export function translate(language, key, params) {
  let value = lookup(translations[language], key)
  if (typeof value !== 'string') {
    value = lookup(translations[defaultLanguage], key)
  }
  if (typeof value !== 'string') {
    if (import.meta.env.DEV) {
      console.warn(`Missing translation for key: ${key}`)
    }
    return key
  }
  if (!params) {
    return value
  }
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

export function formatNumber(value, language) {
  return new Intl.NumberFormat(language).format(value)
}
