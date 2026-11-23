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
      dismiss: 'إغلاق',
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
    upload: {
      title: 'رفع مستند للمعالجة',
      description:
        'ارفع مستندًا عربيًا واحدًا بصيغة PDF أو صورة لتجهيزه للمعالجة الذكية. لا حاجة لتحديد نوع المستند أو طبيعة محتواه.',
      listSeparator: '، ',
      dropzone: {
        ariaLabel: 'منطقة رفع المستند',
        title: 'اسحب المستند وأفلته هنا',
        titleActive: 'أفلت الملف هنا لاختياره',
        titleReplace: 'اسحب مستندًا آخر هنا لاستبدال الملف الحالي',
        or: 'أو',
        browse: 'تصفح الملفات',
        inputLabel: 'اختيار مستند للرفع',
        hint: 'الصيغ المدعومة: {formats} — الحد الأقصى للحجم: {max}',
        single: 'مستند واحد في كل عملية رفع.',
      },
      autoClassify: {
        title: 'لا حاجة لتحديد نوع المستند',
        text: 'لا يلزم اختيار نوع المستند أو تحديد ما إذا كان نصًا مطبوعًا أو مكتوبًا بخط اليد أو يحتوي على جداول؛ سيتولى نموذج الذكاء الاصطناعي تصنيفه تلقائيًا عند ربط خدمة المعالجة في مرحلة لاحقة.',
      },
      file: {
        heading: 'المستند المحدد',
        ready: 'جاهز',
        name: 'اسم الملف',
        type: 'نوع الملف',
        size: 'حجم الملف',
        pages: 'عدد الصفحات',
        pagesLoading: 'جارٍ القراءة…',
        pagesUnavailable: 'غير متاح',
        reading: 'جارٍ قراءة الملف',
        notReady: 'غير جاهز',
        replace: 'استبدال الملف',
        remove: 'إزالة المستند',
        removeAria: 'إزالة المستند {name}',
        selectedAnnouncement: 'تم اختيار المستند {name}',
      },
      fileTypes: {
        pdf: 'مستند PDF',
        jpeg: 'صورة JPEG',
        png: 'صورة PNG',
      },
      sizeUnits: {
        B: '{value} بايت',
        KB: '{value} كيلوبايت',
        MB: '{value} ميجابايت',
      },
      preview: {
        heading: 'معاينة المستند',
        emptyTitle: 'لا يوجد مستند للمعاينة',
        emptyText: 'اختر مستندًا أو اسحبه إلى منطقة الرفع لتظهر معاينته هنا.',
        imageAlt: 'معاينة المستند {name}',
        pdfTitle: 'معاينة ملف PDF: {name}',
        unavailableTitle: 'المعاينة غير متاحة',
        unavailableText:
          'تعذر عرض هذا الملف داخل الصفحة. ما زال بإمكانك متابعة الخطوات التالية.',
        pdfUnavailableText:
          'لا يدعم متصفحك عرض ملفات PDF داخل الصفحة. يمكنك فتح الملف في علامة تبويب جديدة.',
        openInNewTab: 'فتح في علامة تبويب جديدة',
        enlarge: 'تكبير المعاينة',
        backToUpload: 'العودة إلى صفحة الرفع',
        zoomToolbar: 'أدوات تكبير الصورة',
        zoomIn: 'تكبير',
        zoomOut: 'تصغير',
        zoomLevel: 'مستوى التكبير:',
        fit: 'ملاءمة',
        fitToContainer: 'ملاءمة الإطار',
        pdfControlsHint: 'استخدم أدوات عارض PDF للتنقل بين الصفحات والتكبير والتصغير.',
      },
      errors: {
        title: 'تعذر قبول الملف',
        unsupportedType: 'صيغة الملف "{name}" غير مدعومة. الصيغ المدعومة هي: {formats}.',
        tooLarge: 'حجم الملف "{name}" ({size}) يتجاوز الحد الأقصى المسموح به ({max}).',
        empty: 'الملف "{name}" فارغ ولا يمكن استخدامه.',
        multiple: 'يمكن رفع مستند واحد فقط في كل عملية. يرجى اختيار ملف واحد.',
        dismiss: 'إغلاق رسالة الخطأ',
      },
      actions: {
        ariaLabel: 'إجراءات المعالجة',
        start: 'بدء المعالجة',
        starting: 'جارٍ البدء…',
        startHint: 'اختر مستندًا صالحًا لتفعيل زر بدء المعالجة.',
        blocked: {
          readingPdf: 'جارٍ قراءة صفحات ملف PDF. سيتفعّل زر بدء المعالجة عند الانتهاء.',
          pdfError: 'لا يمكن معالجة هذا الملف. يرجى اختيار مستند آخر.',
          pageSelection: 'أدخل أرقام صفحات صحيحة لتفعيل زر بدء المعالجة.',
        },
      },
      pages: {
        heading: 'الصفحات المراد معالجتها',
        loading: 'جارٍ قراءة عدد صفحات ملف PDF…',
        retry: 'إعادة المحاولة',
        modeLegend: 'اختر الصفحات المراد معالجتها',
        modeAll: 'معالجة جميع الصفحات ({total})',
        modeSelected: 'معالجة صفحات محددة فقط',
        rangeLabel: 'أرقام الصفحات',
        rangePlaceholder: 'مثال: ١-٣، ٥، ٨',
        rangeHint:
          'افصل بين الصفحات بفاصلة، واستخدم الشرطة للنطاق (مثل ١-٣). الصفحات المتاحة من ١ إلى {total}.',
        summary: 'الصفحات المحددة: {selected} من {total}',
        summaryNone: 'الصفحات المحددة: لم يتم تحديد صفحات صحيحة بعد (إجمالي الصفحات: {total})',
        selectionErrors: {
          empty: 'يرجى تحديد صفحة واحدة على الأقل.',
          invalidFormat: 'الصيغة "{token}" غير صحيحة. استخدم أرقامًا مفصولة بفواصل أو نطاقًا مثل ١-٣.',
          outOfRange: 'رقم الصفحة {page} غير موجود. يحتوي المستند على الصفحات من ١ إلى {total}.',
          reversedRange: 'النطاق "{token}" غير صحيح. يجب أن يبدأ النطاق برقم أصغر، مثل ١-٣.',
          duplicate: 'الصفحة {page} مكررة. يرجى تحديد كل صفحة مرة واحدة فقط.',
        },
        errors: {
          encryptedTitle: 'الملف محمي بكلمة مرور',
          encryptedText:
            'لا تدعم هذه المرحلة ملفات PDF المحمية بكلمة مرور. يرجى إزالة كلمة المرور من الملف ثم رفعه مرة أخرى، أو اختيار مستند آخر.',
          invalidTitle: 'تعذر قراءة ملف PDF',
          invalidText:
            'يبدو أن الملف تالف أو ليس ملف PDF صالحًا، لذلك تعذر تحديد عدد صفحاته. يرجى اختيار ملف آخر.',
          failedTitle: 'تعذر قراءة صفحات الملف',
          failedText: 'حدث خطأ غير متوقع أثناء قراءة ملف PDF. يمكنك إعادة المحاولة أو اختيار ملف آخر.',
        },
      },
      processing: {
        notConnectedTitle: 'خدمة المعالجة الذكية غير متصلة بعد',
        notConnectedText:
          'لم يتم ربط معالجة المستندات بالذكاء الاصطناعي في هذه المرحلة، لذلك لم تتم معالجة المستند ولم يتم إرساله أو حفظه. ستتوفر هذه الميزة في مرحلة لاحقة.',
        failedTitle: 'تعذر بدء المعالجة',
        failedText: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
      },
      privacy: 'يبقى الملف المحدد داخل متصفحك فقط، ولا يتم إرساله أو حفظه في هذه المرحلة.',
    },
    pages: {
      placeholderHint:
        'هذه الصفحة جزء من الهيكل الأولي للتطبيق، وسيتم بناء وظائفها في المراحل القادمة.',
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
      dismiss: 'Dismiss',
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
    upload: {
      title: 'Upload a document for processing',
      description:
        'Upload a single Arabic document as a PDF or image to prepare it for intelligent processing. You do not need to specify the document type or its content.',
      listSeparator: ', ',
      dropzone: {
        ariaLabel: 'Document upload area',
        title: 'Drag and drop your document here',
        titleActive: 'Drop the file here to select it',
        titleReplace: 'Drop another document here to replace the current file',
        or: 'or',
        browse: 'Browse files',
        inputLabel: 'Choose a document to upload',
        hint: 'Supported formats: {formats} — Maximum size: {max}',
        single: 'One document per upload.',
      },
      autoClassify: {
        title: 'No need to choose a document type',
        text: 'You do not need to select the document type or say whether it contains printed text, handwriting, or tables. The AI model will classify it automatically once the processing service is connected in a later phase.',
      },
      file: {
        heading: 'Selected document',
        ready: 'Ready',
        name: 'File name',
        type: 'File type',
        size: 'File size',
        pages: 'Pages',
        pagesLoading: 'Reading…',
        pagesUnavailable: 'Unavailable',
        reading: 'Reading file',
        notReady: 'Not ready',
        replace: 'Replace file',
        remove: 'Remove document',
        removeAria: 'Remove document {name}',
        selectedAnnouncement: 'Document {name} selected',
      },
      fileTypes: {
        pdf: 'PDF document',
        jpeg: 'JPEG image',
        png: 'PNG image',
      },
      sizeUnits: {
        B: '{value} B',
        KB: '{value} KB',
        MB: '{value} MB',
      },
      preview: {
        heading: 'Document preview',
        emptyTitle: 'No document to preview',
        emptyText: 'Choose a document or drag it onto the upload area to see a preview here.',
        imageAlt: 'Preview of document {name}',
        pdfTitle: 'PDF preview: {name}',
        unavailableTitle: 'Preview unavailable',
        unavailableText: 'This file could not be displayed on the page. You can still continue.',
        pdfUnavailableText:
          'Your browser cannot display PDF files on the page. You can open the file in a new tab.',
        openInNewTab: 'Open in new tab',
        enlarge: 'Enlarge preview',
        backToUpload: 'Back to upload',
        zoomToolbar: 'Image zoom controls',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        zoomLevel: 'Zoom level:',
        fit: 'Fit',
        fitToContainer: 'Fit to frame',
        pdfControlsHint: "Use the PDF viewer's own controls to change pages and zoom.",
      },
      errors: {
        title: 'File not accepted',
        unsupportedType: 'The file "{name}" is not a supported format. Supported formats: {formats}.',
        tooLarge: 'The file "{name}" ({size}) exceeds the maximum allowed size ({max}).',
        empty: 'The file "{name}" is empty and cannot be used.',
        multiple: 'Only one document can be uploaded at a time. Please choose a single file.',
        dismiss: 'Dismiss error message',
      },
      actions: {
        ariaLabel: 'Processing actions',
        start: 'Start Processing',
        starting: 'Starting…',
        startHint: 'Select a valid document to enable Start Processing.',
        blocked: {
          readingPdf: 'Reading the PDF pages. Start Processing will be enabled when this finishes.',
          pdfError: 'This file cannot be processed. Please choose another document.',
          pageSelection: 'Enter valid page numbers to enable Start Processing.',
        },
      },
      pages: {
        heading: 'Pages to process',
        loading: 'Reading the number of pages in the PDF…',
        retry: 'Try again',
        modeLegend: 'Choose which pages to process',
        modeAll: 'Process all pages ({total})',
        modeSelected: 'Process selected pages only',
        rangeLabel: 'Page numbers',
        rangePlaceholder: 'e.g. 1-3, 5, 8',
        rangeHint: 'Separate pages with commas and use a hyphen for ranges (e.g. 1-3). Pages 1 to {total} are available.',
        summary: 'Selected pages: {selected} of {total}',
        summaryNone: 'Selected pages: no valid pages selected yet (total pages: {total})',
        selectionErrors: {
          empty: 'Please select at least one page.',
          invalidFormat: '"{token}" is not valid. Use numbers separated by commas, or a range such as 1-3.',
          outOfRange: 'Page {page} does not exist. The document has pages 1 to {total}.',
          reversedRange: 'The range "{token}" is not valid. A range must start with the smaller number, e.g. 1-3.',
          duplicate: 'Page {page} is listed more than once. Please select each page only once.',
        },
        errors: {
          encryptedTitle: 'This PDF is password-protected',
          encryptedText:
            'Password-protected PDF files are not supported in this phase. Please remove the password from the file and upload it again, or choose another document.',
          invalidTitle: 'Could not read the PDF',
          invalidText:
            'The file appears to be damaged or is not a valid PDF, so its pages could not be counted. Please choose another file.',
          failedTitle: 'Could not read the file pages',
          failedText: 'An unexpected error occurred while reading the PDF. You can try again or choose another file.',
        },
      },
      processing: {
        notConnectedTitle: 'AI processing is not connected yet',
        notConnectedText:
          'AI document processing is not connected in this phase, so your document was not processed, sent, or stored. This feature will be available in a later phase.',
        failedTitle: 'Could not start processing',
        failedText: 'An unexpected error occurred. Please try again.',
      },
      privacy: 'The selected file stays in your browser only. It is not sent or stored in this phase.',
    },
    pages: {
      placeholderHint:
        'This page is part of the initial application shell. Its functionality will be built in upcoming phases.',
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
