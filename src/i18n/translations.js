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
        mockReview: 'فتح للمراجعة التجريبية',
        mockReviewHint: 'يفتح المستند في شاشة المراجعة ببيانات تجريبية، دون ذكاء اصطناعي حقيقي ودون إرسال أي شيء إلى خادم. يبقى المستند في ذاكرة المتصفح لهذه الجلسة فقط.',
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
    queue: {
      description: 'المستندات التي تنتظر مراجعة بشرية. افتح مستندًا لمراجعة صفحاته المختارة وتصحيح محتواه المستخرج.',
      temporaryTitle: 'بيانات تجريبية وحفظ مؤقت',
      temporaryNote:
        'لا يوجد خادم أو ذكاء اصطناعي حقيقي في هذه المرحلة. المستندات المعروضة هنا هي المستند التجريبي الذي ينتظر المراجعة وأي مستند تفتحه للمراجعة من صفحة الرفع، وهي محفوظة في ذاكرة المتصفح لهذه الجلسة فقط وتضيع عند إعادة تحميل الصفحة أو إغلاقها. المستندات المعتمدة تنتقل إلى الأرشيف.',
      simulatedNote:
        'الدور (موظف أو مدير مؤسسة) والاعتماد في هذه المرحلة محاكاة في الواجهة فقط: يرى الموظف مستنداته، ويرى المدير جميع المستندات، لكن لا يوجد خادم يفرض ذلك. الصلاحيات الحقيقية تُنفَّذ لاحقًا في الخادم.',
      listLabel: 'مستندات المراجعة',
      empty: 'لا توجد مستندات للمراجعة حاليًا. ارفع مستندًا ثم افتحه للمراجعة التجريبية.',
      pages: '{selected} صفحة مختارة من {total}',
      reviewed: 'تمت مراجعة {reviewed} من {selected}',
      open: 'فتح المراجعة',
      openReadOnly: 'عرض المستند (للقراءة فقط)',
    },
    archive: {
      description: 'المستندات المعتمدة فقط، للقراءة فقط. المستند الذي ينتظر المراجعة لا يظهر هنا أبدًا.',
      temporaryTitle: 'بيانات تجريبية وحفظ مؤقت',
      temporaryNote:
        'لا يمكن اعتماد أي مستند فعليًا قبل وجود الخادم، لذلك المعروض هنا مستند تجريبي معتمد فقط، وهو محفوظ في ذاكرة المتصفح لهذه الجلسة. البحث والتصفية وإدارة الأرشيف ببيانات حقيقية تأتي في مرحلة لاحقة.',
      listLabel: 'المستندات المعتمدة',
      empty: 'لا توجد مستندات معتمدة حاليًا.',
    },
    review: {
      loading: 'جارٍ تحميل المستند…',
      back: 'العودة إلى قائمة التصحيح',
      backToArchive: 'العودة إلى الأرشيف',
      forbidden: {
        title: 'لا تملك صلاحية عرض هذا المستند',
        text: 'هذا المستند يخص موظفًا آخر. (محاكاة في الواجهة فقط: لا يوجد خادم يفرض الصلاحيات في هذه المرحلة.)',
      },
      missing: {
        title: 'المستند غير متاح',
        text: 'لم يعد هذا المستند موجودًا في هذه الجلسة. تُحفظ مستندات المراجعة مؤقتًا في ذاكرة المتصفح فقط، وتضيع عند إعادة تحميل الصفحة أو إغلاقها.',
      },
      loadError: {
        title: 'تعذر فتح المستند',
        text: 'بيانات المستند المحفوظة غير صالحة، ولم يتم إصلاحها تلقائيًا حتى لا تضيع أي معلومة.',
      },
      header: {
        page: 'الصفحة {page} من الملف الأصلي',
        position: 'الصفحة المختارة {index} من {count}',
        totalPages: 'إجمالي صفحات الملف: {total}',
        approvedBadge: 'معتمد (تجريبي)',
        progress: 'تمت مراجعة {reviewed} من {total} صفحة',
        percent: '{percent}٪',
        progressLabel: 'تقدم مراجعة الصفحات المختارة',
      },
      save: {
        saved: 'تم حفظ جميع التعديلات',
        unsaved: 'تغييرات بانتظار الحفظ',
        saving: 'جارٍ الحفظ',
        failed: 'فشل الحفظ',
        temporaryShort: 'حفظ مؤقت في ذاكرة المتصفح لهذه الجلسة فقط، ولا يُرسل إلى خادم',
        failedHelp: 'لم تُحفظ آخر التعديلات، وستتم المحاولة تلقائيًا.',
        retry: 'إعادة المحاولة',
      },
      split: {
        label: 'تغيير عرض اللوحتين',
        hint: 'اسحب لتغيير العرض، أو استخدم الأسهم. انقر مرتين للعودة إلى ٥٠٪',
      },
      pageStatus: {
        pending: 'بانتظار المعالجة',
        processing: 'قيد المعالجة',
        readyForReview: 'جاهزة للمراجعة',
        failed: 'فشل الاستخراج',
        manualEditing: 'تحرير يدوي',
        reviewed: 'تمت المراجعة',
      },
      ai: {
        label: 'المعالجة الآلية',
        notProcessed: 'لم تُعالَج',
        processing: 'قيد المعالجة',
        succeeded: 'نجح الاستخراج',
        failed: 'فشل الاستخراج',
      },
      reviewState: {
        label: 'المراجعة البشرية',
        notReviewed: 'لم تتم المراجعة',
        reviewed: 'تمت المراجعة',
        invalidated: 'تحتاج مراجعة جديدة',
      },
      viewer: {
        title: 'الصفحة الأصلية',
        toolbar: 'أدوات عرض الصفحة الأصلية',
        zoomOut: 'تصغير',
        zoomIn: 'تكبير',
        zoomLevel: 'التكبير:',
        rotate: 'تدوير العرض ٩٠ درجة',
        rotateHint: 'التدوير للعرض فقط ولا يغيّر الملف الأصلي',
        reset: 'إعادة ضبط العرض',
        noFileTitle: 'الملف الأصلي غير متاح',
        noFileText: 'لا يتوفر الملف الأصلي لهذا المستند في الجلسة الحالية، لذلك لا يمكن عرض صفحته. ما زال بإمكانك مراجعة المحتوى.',
        errorTitle: 'تعذر فتح ملف PDF',
        errors: {
          encrypted: 'الملف محمي بكلمة مرور ولا يمكن عرضه.',
          invalid: 'الملف تالف أو ليس ملف PDF صالحًا.',
          failed: 'حدث خطأ غير متوقع أثناء فتح الملف.',
        },
        canvasLabel: 'الصفحة الأصلية رقم {page}',
        frameLabel: 'منطقة عرض الصفحة الأصلية، يمكن التمرير والسحب عند التكبير',
        loading: 'جارٍ فتح الملف…',
        renderError: 'تعذر رسم هذه الصفحة.',
        hint: 'عند التكبير اسحب الصفحة بالفأرة أو مرّر لتحريكها. التدوير والتكبير للعرض فقط.',
      },
      nav: {
        ariaLabel: 'التنقل بين الصفحات المختارة',
        previous: 'الصفحة السابقة',
        next: 'الصفحة التالية',
        current: 'الصفحة {page}',
        jumpLabel: 'الانتقال إلى الصفحة',
        jumpPlaceholder: 'رقم الصفحة',
        jumpGo: 'انتقال',
        jumpErrors: {
          empty: 'أدخل رقم الصفحة.',
          invalid: 'أدخل رقم صفحة صحيحًا.',
          notSelected: 'هذه الصفحة ليست ضمن الصفحات المختارة للمراجعة.',
        },
        allPages: 'قائمة الصفحات',
        listTitle: 'الصفحات المختارة',
        listPrev: 'السابق',
        listNext: 'التالي',
        listWindow: 'عرض {from}–{to} من {total}',
        close: 'إغلاق',
        unselectedNote: 'تُراجَع الصفحات المختارة عند الرفع فقط، ولا تُحتسب بقية صفحات الملف كصفحات فاشلة أو غير مراجَعة.',
        announce: 'تم فتح الصفحة {page}',
      },
      toolbar: {
        label: 'أدوات التحرير',
        undo: 'تراجع',
        redo: 'إعادة',
        undoHint: 'التراجع عن آخر تعديل في هذه الصفحة (Ctrl+Z)',
        redoHint: 'إعادة التعديل الذي تم التراجع عنه (Ctrl+Y)',
      },
      search: {
        label: 'بحث في محتوى الصفحة الحالية',
        placeholder: 'بحث في هذه الصفحة…',
        results: 'عدد التطابقات في هذه الصفحة: {count}',
        none: 'لا توجد تطابقات في هذه الصفحة.',
      },
      editor: {
        title: 'المحتوى المستخرج',
        readOnly: 'هذه الصفحة للقراءة فقط الآن، فلا يمكن تعديل محتواها.',
        listLabel: 'عناصر الصفحة بترتيبها في المستند',
        empty: 'لا يوجد محتوى في هذه الصفحة.',
      },
      element: {
        types: {
          heading: 'عنوان',
          paragraph: 'فقرة',
          table: 'جدول',
          field: 'حقل (اسم وقيمة)',
          unclassified: 'غير مصنَّف',
        },
        headingLevel: 'مستوى العنوان',
        headingText: 'نص العنوان',
        paragraphText: 'نص الفقرة',
        fieldKey: 'اسم الحقل',
        fieldValue: 'قيمة الحقل',
        unclassifiedText: 'نص العنصر غير المصنَّف',
        rawData: 'بيانات خام محفوظة',
        rawDataNote: 'هذه البيانات محفوظة كما وردت ولا تُعدَّل من هنا.',
        position: 'العنصر {index} من {count}',
        dragHint: 'اسحب لإعادة ترتيب العنصر',
        typeLabel: 'نوع {position}',
        sourceManual: 'أُضيف يدويًا',
        sourceMock: 'مستخرج (تجريبي)',
        sourceAi: 'مستخرج بالذكاء الاصطناعي',
        moveUp: 'تحريك {type} ({position}) إلى الأعلى',
        moveDown: 'تحريك {type} ({position}) إلى الأسفل',
        moveUpShort: 'للأعلى',
        moveDownShort: 'للأسفل',
        delete: 'حذف {type} ({position})',
        deleteShort: 'حذف',
      },
      insert: {
        here: 'إضافة عنصر هنا',
        addFirst: 'إضافة أول عنصر',
        chooseType: 'اختر نوع العنصر الجديد',
        labelBefore: 'إضافة عنصر هنا، قبل العنصر {position} من {count}',
        labelEnd: 'إضافة عنصر هنا، في نهاية الصفحة بعد العنصر {count}',
        cancel: 'إلغاء',
      },
      table: {
        caption: 'جدول من {rows} صفوف و{columns} أعمدة',
        cell: 'الصف {row}، العمود {column}',
        addColumnAfter: 'إضافة عمود بعد العمود {column}',
        removeColumn: 'حذف العمود {column}',
        removeColumnTitle: 'حذف العمود {column}؟',
        removeColumnText: 'يحتوي هذا العمود على نصوص ستُحذف من الجدول. يمكنك التراجع عن الحذف بعد ذلك.',
        removeColumnConfirm: 'حذف العمود',
        addRowAfter: 'إضافة صف بعد الصف {row}',
        removeRow: 'حذف الصف {row}',
        removeRowTitle: 'حذف الصف {row}؟',
        removeRowText: 'يحتوي هذا الصف على نصوص ستُحذف من الجدول. يمكنك التراجع عن الحذف بعد ذلك.',
        removeRowConfirm: 'حذف الصف',
      },
      delete: {
        title: 'حذف العنصر؟',
        text: 'يحتوي هذا العنصر على بيانات مركّبة (جدول به نصوص أو بيانات خام محفوظة). يمكنك التراجع عن الحذف بعد ذلك.',
        confirm: 'حذف العنصر',
      },
      convert: {
        title: 'تغيير نوع العنصر قد يفقد معلومات',
        confirm: 'تغيير النوع رغم ذلك',
        intro: 'عند تحويل العنصر من «{from}» إلى «{to}» لن تبقى هذه المعلومات كما هي:',
        lost: {
          tableStructure: 'بنية الجدول (الصفوف والأعمدة) ستتحول إلى نص عادي.',
          fieldRelationship: 'الارتباط بين اسم الحقل وقيمته سيتحول إلى نص واحد.',
          unclassifiedRaw: 'البيانات الخام المحفوظة مع العنصر لن يكون لها مكان في النوع الجديد.',
        },
        preview: 'شكل العنصر بعد التحويل:',
        emptyPreview: '(فارغ)',
        undoNote: 'يمكنك التراجع عن هذا التغيير بعد تنفيذه.',
      },
      confirm: {
        cancel: 'إلغاء',
      },
      errors: {
        title: 'تعذر تنفيذ العملية',
        dismiss: 'إغلاق الرسالة',
        generic: 'لم يتم تنفيذ العملية. يرجى المحاولة مرة أخرى.',
        DOCUMENT_APPROVED: 'هذا المستند معتمد ولا يمكن تعديله.',
        APPROVAL_PENDING: 'طلب الاعتماد قيد التنفيذ، فلا يمكن تعديل المستند حتى ينتهي.',
        INVALID_DOCUMENT: 'النتيجة الجديدة غير صالحة أو تتعارض مع بيانات أخرى في المستند، فلم تُطبَّق.',
        PAGE_PROCESSING: 'هذه الصفحة قيد المعالجة، ولا يمكن تعديلها أو تأكيد مراجعتها أو استبدال محتواها حتى تنتهي.',
        PENDING_EDITS_COMMITTED: 'كان لديك نص قيد الكتابة، فحُفظ في الصفحة قبل الاستبدال، وتغيّر المحتوى الحالي عمّا شاهدته في المقارنة. لم يُستبدل شيء؛ راجع المقارنة مرة أخرى ثم اعتمد النتيجة الجديدة إذا ما زلت ترغب في ذلك.',
        CONFIRMATION_REQUIRED: 'هذا التغيير يحتاج إلى تأكيد صريح.',
        REVIEW_NOT_ALLOWED: 'لا يمكن تأكيد مراجعة هذه الصفحة الآن.',
        DUPLICATE_ID: 'تعذر تنفيذ العملية لأن المعرّف مستخدم في مكان آخر من المستند.',
        ELEMENT_NOT_FOUND: 'العنصر المطلوب لم يعد موجودًا.',
        PAGE_NOT_SELECTED: 'هذه الصفحة ليست ضمن الصفحات المختارة للمراجعة.',
        INVALID_CONVERSION: 'لا يمكن تحويل العنصر إلى هذا النوع.',
        LAST_TABLE_ROW: 'يجب أن يبقى في الجدول صف واحد على الأقل.',
        LAST_TABLE_COLUMN: 'يجب أن يبقى في الجدول عمود واحد على الأقل.',
      },
      reviewBar: {
        label: 'مراجعة الصفحة',
        confirm: 'تمت مراجعة الصفحة',
        reviewed: 'تمت مراجعة هذه الصفحة',
        invalidated: 'تغيّر محتوى الصفحة بعد تأكيد مراجعتها. أكّد المراجعة من جديد بعد التحقق من التعديلات.',
        approved: 'المستند معتمد، فلا يمكن تغيير حالة مراجعة صفحاته.',
        approvalPending: 'طلب الاعتماد قيد التنفيذ، فلا يمكن تغيير حالة المراجعة الآن.',
        hint: 'لا تصبح الصفحة «تمت مراجعتها» بمجرد فتحها أو تعديلها، بل بالضغط على هذا الزر فقط. وأي تعديل لاحق (بما فيه التراجع والإعادة) يُلغي التأكيد.',
        blocked: {
          processing: 'لا يمكن تأكيد المراجعة أثناء معالجة الصفحة.',
          noContent: 'لا يمكن تأكيد المراجعة قبل وجود محتوى صالح في الصفحة. أضف المحتوى أو انتظر نتيجة المعالجة.',
          failedWithoutContent: 'فشل استخراج هذه الصفحة. لا يمكن تأكيد مراجعتها إلا بعد إدخال محتوى صالح يدويًا.',
        },
      },
      processing: {
        label: 'حالة المعالجة الآلية',
        mockNote: 'المعالجة هنا تجريبية: لا يوجد ذكاء اصطناعي حقيقي في هذه المرحلة، والنتائج بيانات مختلقة للعرض فقط.',
        running: 'جارٍ معالجة الصفحة (تجريبي)… التحرير متوقف مؤقتًا حتى تنتهي.',
        failedTitle: 'فشل استخراج هذه الصفحة',
        failedText: 'تعذّر الاستخراج الآلي (رمز الخطأ: {code}). الصفحة الأصلية ما زالت ظاهرة أمامك.',
        failedManual: 'يمكنك إعادة المحاولة، أو إدخال محتوى الصفحة يدويًا في المحرر ثم مراجعته وتأكيده.',
        retry: 'إعادة معالجة الصفحة (تجريبي)',
        manualTitle: 'تحرير يدوي',
        manualAfterFailure: 'فشل الاستخراج الآلي لهذه الصفحة، والمحتوى الحالي مُدخَل يدويًا. ستبقى حالة المعالجة «فشل الاستخراج» ولن تُعتبر نتيجة ذكاء اصطناعي ناجحة.',
        manualBeforeProcessing: 'المحتوى الحالي مُدخَل يدويًا قبل المعالجة الآلية.',
        reprocess: 'إعادة المعالجة (تجريبي)',
        pending: 'لم تُعالَج هذه الصفحة بعد.',
        start: 'بدء المعالجة (تجريبي)',
        reprocessFailedTitle: 'فشلت إعادة المعالجة',
        reprocessFailedText: 'لم يتغير المحتوى الحالي للصفحة.',
        invalidResultFailed: 'كانت نتيجة الاستخراج غير صالحة (بنية خاطئة أو معرّفات مكررة)، فلم تُطبَّق على الصفحة.',
        invalidResultNotice: 'كانت نتيجة إعادة المعالجة غير صالحة (بنية خاطئة أو معرّفات مكررة)، فلم تُعرض للمقارنة ولم يتغير المحتوى الحالي للصفحة.',
        comparison: {
          title: 'مقارنة نتيجة إعادة المعالجة',
          intro: 'اكتملت محاولة المعالجة رقم {attempt} (تجريبية). لم يُستبدل شيء بعد: قارن بين المحتويين ثم قرّر.',
          current: 'المحتوى الحالي',
          new: 'نتيجة إعادة المعالجة (المحاولة {attempt})',
          empty: 'لا يوجد محتوى.',
          accept: 'اعتماد النتيجة الجديدة',
          keep: 'الإبقاء على المحتوى الحالي',
        },
        accept: {
          title: 'استبدال المحتوى الحالي؟',
          text: 'عند اعتماد النتيجة الجديدة:',
          replaces: 'يُستبدل محتوى الصفحة الحالي (بما فيه تصحيحاتك) بالنتيجة الجديدة.',
          history: 'يُمسح سجل التراجع والإعادة لهذه الصفحة، ولا يمكن التراجع عن الاستبدال.',
          review: 'يُلغى تأكيد مراجعة الصفحة إن كان المحتوى قد تغيّر، فتحتاج إلى تأكيدها من جديد.',
          failedTitle: 'تعذر اعتماد النتيجة الجديدة',
          failedNote: 'لم يتغير محتوى الصفحة ولم يُمسح سجل التراجع. يمكنك الإبقاء على المحتوى الحالي من زر «الإبقاء على المحتوى الحالي».',
          confirm: 'اعتماد النتيجة الجديدة',
        },
      },
      json: {
        show: 'عرض JSON للصفحة الحالية',
        hide: 'إخفاء JSON',
        readOnly: 'للقراءة فقط',
        note: 'يُولَّد هذا الـ JSON من بيانات المحرر نفسها في كل مرة، ولا يمكن تعديله هنا. عدّل المحتوى من المحرر وسيتغير تلقائيًا.',
        copy: 'نسخ JSON',
        copied: 'تم النسخ',
        copyFailed: 'تعذّر النسخ إلى الحافظة. حدّد النص في المربع أدناه وانسخه يدويًا (Ctrl+C).',
        label: 'JSON الصفحة الحالية (للقراءة فقط)',
      },
      approval: {
        title: 'اعتماد المستند',
        intro: 'لا يمكن اعتماد المستند إلا عند تحقق كل الشروط التالية:',
        conditions: {
          pages: 'تمت مراجعة جميع الصفحات المختارة ({reviewed} من {total}).',
          saved: 'تم حفظ جميع التعديلات.',
          processing: 'لا توجد معالجة جارية.',
          permission: 'يملك المستخدم صلاحية الاعتماد.',
        },
        action: 'اعتماد المستند بالكامل',
        noBackend: 'الاعتماد الفعلي غير متاح في هذه المرحلة لأنه يحتاج إلى خدمة خلفية تسجّله بشكل دائم؛ لذلك لن يُعتمد أي مستند حتى لو تحققت الشروط.',
        approvedTitle: 'المستند معتمد',
        approvedText: 'هذا مستند تجريبي معتمد، ولا يمكن لأي مستخدم تعديله. وحده مدير المؤسسة يستطيع بدء إصدار جديد قابل للتعديل.',
        newVersion: 'إنشاء إصدار جديد قابل للتعديل',
        adminOnly: 'إنشاء إصدار جديد قابل للتعديل من صلاحيات مدير المؤسسة فقط. دورك الحالي: {role}.',
        notice: {
          approved: {
            title: 'تم اعتماد المستند',
            text: 'اعتمدت الخدمة المستند.',
          },
          versionCreated: {
            title: 'تم إنشاء إصدار جديد',
            text: 'أنشأت الخدمة إصدارًا جديدًا قابلًا للتعديل.',
          },
          notConnected: {
            title: 'لم يتم الاعتماد',
            text: 'خدمة الاعتماد غير متصلة في هذه المرحلة، لذلك لم يُعتمد المستند ولم يُحفظ أي شيء. ستتوفر هذه الميزة عند ربط الخلفية.',
          },
          refused: {
            title: 'تعذّر تنفيذ الطلب',
            text: 'رفضت الخدمة الطلب. يرجى المحاولة لاحقًا.',
          },
        },
      },
      mockTools: {
        title: 'أدوات العرض التجريبي (للتطوير فقط)',
        note: 'تظهر هذه الأدوات في نسخة التطوير فقط لتجربة حالات الفشل يدويًا.',
        failSaves: 'محاكاة فشل الحفظ',
        failNext: 'جعل المعالجة التالية للصفحة {page} تفشل',
      },
      leave: {
        title: 'مغادرة الصفحة؟',
        text: 'قد يضيع عملك أو يتوقف إذا غادرت الآن:',
        confirm: 'مغادرة الصفحة',
        stay: 'البقاء في الصفحة',
        reasons: {
          unsavedChanges: 'توجد تغييرات لم تُحفظ بعد.',
          processingActive: 'توجد صفحة قيد المعالجة وستتوقف معالجتها.',
          pendingComparison: 'توجد نتيجة إعادة معالجة بانتظار قرارك، وستضيع إن غادرت.',
          temporaryStorage: 'الحفظ مؤقت في ذاكرة المتصفح وستضيع التعديلات عند إعادة تحميل الصفحة.',
        },
      },
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
