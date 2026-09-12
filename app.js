/* ==========================================================================
   نظام YLY لتتبع الأهداف - ملف الجافاسكريبت الرئيسي (app.js)
   ========================================================================== */

// --- 1. إعدادات Firebase & Cloudinary ---
const firebaseConfig = {
    apiKey: "AIzaSyAinjc2LH9gpwdZ1-000_y5Ggsv2WgJYLA",
    authDomain: "goals-yly.firebaseapp.com",
    projectId: "goals-yly",
    storageBucket: "goals-yly.firebasestorage.app",
    messagingSenderId: "708760417066",
    appId: "1:708760417066:web:04654cc9c30a2a4dc1a453",
    measurementId: "G-07SL7TYLZV"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dsxrjmcxs/image/upload";
const CLOUDINARY_PRESET = "My_public_preset";
const DEFAULT_SYSTEM_LOGO = "https://res.cloudinary.com/dsxrjmcxs/image/upload/c_limit,w_1200,q_auto,f_auto/v1789071039/ecmjgwmjnhyvfpviggwx.png";

// متغيرات الحالة العامة
let currentUser = null;
let currentUserData = {};
let myGoals = [];
let publicUserGoals = [];
let isProfileEditExpanded = false;
let regAvatarFile = null;
let currentActiveTab = 'home';

let currentControlView = 'habits';
let publicControlView = 'habits';
let recordsFilter = 'habit';

let selectedGoalPeriod = 'habit';
let selectedGoalType = 'yly';

let currentEditGoalId = null;
let currentDeleteGoalId = null;

// --- 2. دوال الواجهة المساعدة ---
function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => { splash.style.display = 'none'; }, 400);
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = `toast show ${isError ? 'error' : ''}`;
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function openImageViewer(src) {
    if (!src || src.includes('placeholder')) return;
    document.getElementById('image-viewer-img').src = src;
    document.getElementById('image-viewer-modal').style.display = 'flex';
}
function closeImageViewer() {
    document.getElementById('image-viewer-modal').style.display = 'none';
}

// استخراج صورة بدقة فائقة w_1200 من كلاوديناري لبطاقة المشاركة
function getHighResPhotoUrl(url) {
    if (!url || url.includes('placeholder')) return DEFAULT_SYSTEM_LOGO;
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
        return url.replace('/upload/', '/upload/c_limit,w_1200,q_auto,f_auto/');
    }
    return url;
}

// --- 3. النوافذ الميني المخصصة (بدل prompt و confirm) ---
function openMiniEdit(id, oldTitle) {
    currentEditGoalId = id;
    document.getElementById('mini-edit-input').value = oldTitle;
    document.getElementById('mini-edit-modal').style.display = 'flex';
}
function closeMiniEdit() {
    document.getElementById('mini-edit-modal').style.display = 'none';
    currentEditGoalId = null;
}
function confirmMiniEdit() {
    const newTitle = document.getElementById('mini-edit-input').value.trim();
    if (!newTitle) return showToast("يرجى كتابة النص أولاً", true);

    db.collection('users').doc(currentUser.uid).collection('goals').doc(currentEditGoalId).update({
        title: newTitle
    }).then(() => {
        showToast("تم التعديل بنجاح");
        closeMiniEdit();
    });
}

function openMiniDelete(id) {
    currentDeleteGoalId = id;
    document.getElementById('mini-delete-modal').style.display = 'flex';
}
function closeMiniDelete() {
    document.getElementById('mini-delete-modal').style.display = 'none';
    currentDeleteGoalId = null;
}
function confirmMiniDelete() {
    db.collection('users').doc(currentUser.uid).collection('goals').doc(currentDeleteGoalId).delete()
        .then(() => {
            showToast("تم الحذف بنجاح");
            closeMiniDelete();
        });
}

// --- 4. القوائم المنسدلة المخصصة ---
function toggleCustomDropdown(menuId) {
    const menu = document.getElementById(menuId);
    const isShown = menu.style.display === 'block';
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.style.display = 'none');
    menu.style.display = isShown ? 'none' : 'block';
}

function selectCustomDropdown(kind, val, text) {
    if (kind === 'period') {
        selectedGoalPeriod = val;
        document.getElementById('dd-period-val').innerText = text;
    } else if (kind === 'type') {
        selectedGoalType = val;
        document.getElementById('dd-type-val').innerText = text;
    }
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.style.display = 'none');
}

window.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown-box')) {
        document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.style.display = 'none');
    }
});

// --- 5. دوال التواريخ والرتب ---
function getTodayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateLiveHeaderDate() {
    const d = new Date();
    const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    const formatted = `${d.getDate()} ${months[d.getMonth()]}`;
    const el = document.getElementById('current-live-date');
    if (el) el.innerText = formatted;
}
updateLiveHeaderDate();

function getUserRankBadge(points) {
    const p = points || 0;
    if (p >= 600) return { title: 'أسطورة YLY 👑', css: 'badge-legend' };
    if (p >= 300) return { title: 'بطل YLY 🥇', css: 'badge-gold' };
    if (p >= 100) return { title: 'مثابر 🥈', css: 'badge-silver' };
    return { title: 'مبتدئ 🥉', css: 'badge-bronze' };
}

// --- 6. نظام المصادقة والحسابات ---
function switchAuthTab(type) {
    document.getElementById('tab-login-btn').classList.toggle('active', type === 'login');
    document.getElementById('tab-register-btn').classList.toggle('active', type === 'register');
    document.getElementById('login-form').style.display = type === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = type === 'register' ? 'block' : 'none';
}

function previewRegisterAvatar(e) {
    const file = e.target.files[0];
    if (file) {
        regAvatarFile = file;
        const reader = new FileReader();
        reader.onload = (uploadEvent) => {
            const img = document.getElementById('reg-avatar-preview');
            const icon = document.getElementById('reg-avatar-icon');
            img.src = uploadEvent.target.result;
            img.style.display = 'block';
            icon.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        loadUserData();
        loadSharedMembers();
        loadLeaderboard();
        loadUserSupportHistory();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        hideSplashScreen();
    }
});

// إنشاء حساب (إذا لم يرفع صورة يتم وضع اللوجو الرسمي تلقائياً)
async function handleEmailRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-register-submit');
    const originalText = btn.innerHTML;

    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-pass-confirm').value;

    if (name.split(" ").length < 3) return showToast("يرجى كتابة الاسم الثلاثي كاملاً", true);
    if (phone.length < 10) return showToast("يرجى إدخال رقم هاتف صحيح", true);
    if (pass !== confirmPass) return showToast("كلمات المرور غير متطابقة", true);

    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري إنشاء الحساب...`;
    btn.disabled = true;

    // وضع اللوجو كافتراضي في حال عدم اختيار صورة
    let photoURL = DEFAULT_SYSTEM_LOGO;

    if (regAvatarFile) {
        try {
            const formData = new FormData();
            formData.append('file', regAvatarFile);
            formData.append('upload_preset', CLOUDINARY_PRESET);
            const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const d = await res.json();
            if (d.secure_url) photoURL = d.secure_url;
        } catch(err) {
            console.log("Image upload skipped, using default logo");
        }
    }

    auth.createUserWithEmailAndPassword(email, pass)
        .then(res => {
            return db.collection('users').doc(res.user.uid).set({
                fullName: name,
                phone: phone,
                email: email,
                photoURL: photoURL,
                points: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            showToast("تم إنشاء الحساب بنجاح");
        })
        .catch(err => {
            showToast(err.message, true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

function handleEmailLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-login-submit');
    const originalText = btn.innerHTML;

    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;

    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري تسجيل الدخول...`;
    btn.disabled = true;

    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => {
            showToast("البريد أو كلمة السر غير صحيحة", true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

// --- 7. تحميل بيانات المستخدم الحالي ---
function loadUserData() {
    if (!currentUser) return;
    db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            currentUserData = doc.data();
            document.getElementById('profile-display-name').innerText = currentUserData.fullName || "مستخدم";
            document.getElementById('view-name').innerText = currentUserData.fullName || "غير محدد";
            document.getElementById('view-phone').innerText = currentUserData.phone || "غير مسجل";
            document.getElementById('view-email').innerText = currentUserData.email || "";
            document.getElementById('view-points').innerText = `${currentUserData.points || 0} نقطة`;
            
            const avatarUrl = currentUserData.photoURL || DEFAULT_SYSTEM_LOGO;
            document.getElementById('user-avatar').src = avatarUrl;
            
            const rank = getUserRankBadge(currentUserData.points);
            document.getElementById('profile-user-rank-badge').innerHTML = `<span class="rank-badge-tag ${rank.css}">${rank.title}</span>`;

            updateSmartGreeting();
            hideSplashScreen();
        }
    });

    db.collection('users').doc(currentUser.uid).collection('goals').onSnapshot(snap => {
        myGoals = [];
        snap.forEach(doc => myGoals.push({ id: doc.id, ...doc.data() }));
        renderGoals();
        if (document.getElementById('page-records').classList.contains('active')) {
            renderRecordsTable();
        }
    });
}

function toggleProfileEdit() {
    isProfileEditExpanded = !isProfileEditExpanded;
    const viewSec = document.getElementById('profile-view-section');
    const editSec = document.getElementById('profile-edit-section');
    const btn = document.getElementById('toggle-edit-btn');

    if (isProfileEditExpanded) {
        viewSec.style.display = 'none';
        editSec.style.display = 'block';
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> إلغاء';
        document.getElementById('inline-edit-name').value = currentUserData.fullName || "";
        document.getElementById('inline-edit-phone').value = currentUserData.phone || "";
        document.getElementById('inline-edit-pass').value = "";
    } else {
        viewSec.style.display = 'block';
        editSec.style.display = 'none';
        btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل';
    }
}

function saveUnifiedProfile(e) {
    e.preventDefault();
    const name = document.getElementById('inline-edit-name').value.trim();
    const phone = document.getElementById('inline-edit-phone').value.trim();
    const newPass = document.getElementById('inline-edit-pass').value;

    if (!name) return showToast("الاسم مطلوب", true);

    db.collection('users').doc(currentUser.uid).update({
        fullName: name,
        phone: phone
    }).then(() => {
        if (newPass) {
            if (newPass.length < 6) {
                showToast("كلمة السر يجب أن تكون 6 أحرف على الأقل", true);
                return;
            }
            currentUser.updatePassword(newPass).then(() => {
                showToast("تم تحديث البيانات وكلمة المرور");
                toggleProfileEdit();
            }).catch(err => showToast(err.message, true));
        } else {
            showToast("تم حفظ البيانات بنجاح");
            toggleProfileEdit();
        }
    }).catch(() => showToast("حدث خطأ أثناء الحفظ", true));
}

// --- 8. نظام التنقل بين الصفحات ---
function navigateTab(tabId) {
    currentActiveTab = tabId;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + tabId).classList.add('active');

    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const targetNav = document.querySelector(`.nav-link[onclick*="${tabId}"]`);
    if (targetNav) targetNav.classList.add('active');

    const titles = {
        'home': { t: 'أهداف الأعضاء', s: 'استكشف الأهداف المشتركة مع زملائك' },
        'control': { t: 'لوحة التحكم والإنجاز', s: 'أضف وتابع مهامك وعاداتك' },
        'support': { t: 'الدعم الفني والشكاوى', s: 'تواصل مباشرة مع إدارة النظام' },
        'leaderboard': { t: 'لوحة الشرف للمتميزين', s: 'قائمة المتصدرين في الإنجاز' },
        'profile': { t: 'الملف الشخصي', s: 'إدارة وتعديل بيانات حسابك' }
    };

    document.getElementById('header-title').innerText = titles[tabId].t;
    document.getElementById('header-subtitle').innerText = titles[tabId].s;

    document.getElementById('btn-back').style.display = 'none';
    document.getElementById('bottom-nav-bar').style.display = 'flex';
}

function goBack() {
    navigateTab(currentActiveTab);
}

// --- 9. محرك الترحيب وتحديث الدوائر والعدادات ---
function isGoalCompletedCurrentCycle(g) {
    if (g.period === 'habit') {
        const today = getTodayDateStr();
        return (g.completedHabitDates || []).includes(today);
    } else {
        return !!g.completed;
    }
}

function updateSmartGreeting() {
    const hour = new Date().getHours();
    const isMorning = hour >= 4 && hour < 12;
    const timeWord = isMorning ? "صباح الخير" : "مساء الخير";
    const firstName = currentUserData.fullName ? currentUserData.fullName.split(" ")[0] : "يا بطل";

    // 1. حساب العادات اليومية
    const habits = myGoals.filter(g => g.period === 'habit');
    const totalHabits = habits.length;
    const completedHabits = habits.filter(g => isGoalCompletedCurrentCycle(g)).length;
    const habitRate = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;

    // 2. حساب الأهداف العامة
    const goalsOnly = myGoals.filter(g => g.period !== 'habit');
    const totalGoals = goalsOnly.length;
    const completedGoals = goalsOnly.filter(g => isGoalCompletedCurrentCycle(g)).length;
    const goalRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

    let desc = "";
    if (myGoals.length === 0) {
        desc = "لم تقم بإضافة عادات أو أهداف بعد، ابدأ بتسجيل مهامك الآن.";
    } else if (habitRate === 100 && goalRate === 100) {
        desc = "إنجاز أسطوري! أتممت جميع عاداتك وأهدافك بالكامل، أنت في الصدارة!";
    } else if (habitRate === 0 && goalRate === 0) {
        desc = "لم تبدأ بعد في إنجاز مهامك، خطوة صغيرة تصنع فارقاً كبيراً، ابدأ الآن!";
    } else {
        desc = `لقد حققت ${habitRate}٪ من عاداتك و ${goalRate}٪ من أهدافك، استمر في التطوير!`;
    }

    document.getElementById('greeting-title').innerText = `${timeWord} يا ${firstName}`;
    document.getElementById('greeting-msg').innerText = desc;

    // تحديث دائرة العادات (أخضر للإنجاز والباقي فارغ شفاف)
    const habitsChart = document.getElementById('chart-habits');
    const habitsText = document.getElementById('text-habits-chart');
    if (habitsChart && habitsText) {
        habitsText.innerText = habitRate + "%";
        habitsChart.style.background = `conic-gradient(var(--success) 0% ${habitRate}%, rgba(255,255,255,0.15) ${habitRate}% 100%)`;
    }

    // تحديث دائرة الأهداف (أخضر للإنجاز والباقي فارغ شفاف)
    const goalsChart = document.getElementById('chart-goals');
    const goalsText = document.getElementById('text-goals-chart');
    if (goalsChart && goalsText) {
        goalsText.innerText = goalRate + "%";
        goalsChart.style.background = `conic-gradient(var(--success) 0% ${goalRate}%, rgba(255,255,255,0.15) ${goalRate}% 100%)`;
    }

    // تحديث عدادات الإحصائيات في صفحة حسابي
    const elHabitsTotal = document.getElementById('stat-habits-total');
    if (elHabitsTotal) {
        elHabitsTotal.innerText = totalHabits;
        document.getElementById('stat-habits-completed').innerText = completedHabits;
        document.getElementById('stat-habits-pending').innerText = totalHabits - completedHabits;
        document.getElementById('stat-habits-rate').innerText = habitRate + "%";

        document.getElementById('stat-goals-total').innerText = totalGoals;
        document.getElementById('stat-goals-completed').innerText = completedGoals;
        document.getElementById('stat-goals-pending').innerText = totalGoals - completedGoals;
        document.getElementById('stat-goals-rate').innerText = goalRate + "%";
    }
}

// --- 10. إدارة الأهداف والعادات ---
function addGoal() {
    const title = document.getElementById('goal-input').value.trim();
    if (!title) return showToast("اكتب عنوان الهدف أو العادة أولاً", true);

    const todayStr = getTodayDateStr();

    db.collection('users').doc(currentUser.uid).collection('goals').add({
        title: title,
        period: selectedGoalPeriod, // 'habit' أو 'goal'
        type: selectedGoalType,     // 'yly' أو 'personal'
        completed: false,
        createdDate: todayStr,
        completedDate: null,
        completedHabitDates: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        document.getElementById('goal-input').value = "";
        showToast("تم الحفظ بنجاح");
    });
}

function switchControlView(viewMode, btn) {
    currentControlView = viewMode;
    document.querySelectorAll('#page-control .period-tab-duo').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    if (viewMode === 'habits') {
        document.getElementById('col-title-yly').innerText = 'عادات YLY';
        document.getElementById('col-title-personal').innerText = 'عادات شخصية';
    } else {
        document.getElementById('col-title-yly').innerText = 'أهداف YLY';
        document.getElementById('col-title-personal').innerText = 'أهداف شخصية';
    }

    renderGoals();
}

function renderGoals() {
    const ylyBox = document.getElementById('yly-goals-container');
    const personalBox = document.getElementById('personal-goals-container');
    ylyBox.innerHTML = "";
    personalBox.innerHTML = "";

    const isHabitView = (currentControlView === 'habits');
    const activeList = myGoals.filter(g => isHabitView ? (g.period === 'habit') : (g.period !== 'habit'));

    activeList.forEach(g => {
        const isDone = isGoalCompletedCurrentCycle(g);
        const item = createGoalDomItem(g, isDone);
        if (g.type === 'yly') ylyBox.appendChild(item);
        else personalBox.appendChild(item);
    });

    if (ylyBox.innerHTML === "") ylyBox.innerHTML = `<div style='font-size:0.65rem; color:#aaa; text-align:center;'>لا توجد ${isHabitView ? 'عادات' : 'أهداف'} YLY</div>`;
    if (personalBox.innerHTML === "") personalBox.innerHTML = `<div style='font-size:0.65rem; color:#aaa; text-align:center;'>لا توجد ${isHabitView ? 'عادات' : 'أهداف'} شخصية</div>`;

    updateSmartGreeting();
}

function createGoalDomItem(g, isDone) {
    const item = document.createElement('div');
    item.className = 'goal-item';
    item.innerHTML = `
        <input type="checkbox" class="goal-checkbox" ${isDone ? 'checked' : ''} onchange="toggleGoalExecution('${g.id}', ${!isDone}, '${g.period || 'goal'}')">
        <span style="${isDone ? 'text-decoration: line-through; color: #888;' : ''}">${g.title}</span>
        <div class="goal-actions">
            <i class="fa-solid fa-pen-to-square goal-action-icon" title="تعديل" onclick="openMiniEdit('${g.id}', '${g.title.replace(/'/g, "\\'")}')"></i>
            <i class="fa-solid fa-trash-can goal-action-icon del" title="حذف" onclick="openMiniDelete('${g.id}')"></i>
        </div>
    `;
    return item;
}

function toggleGoalExecution(goalId, toCompleted, period) {
    const todayStr = getTodayDateStr();
    const goalRef = db.collection('users').doc(currentUser.uid).collection('goals').doc(goalId);

    if (period === 'habit') {
        if (toCompleted) {
            goalRef.update({
                completedHabitDates: firebase.firestore.FieldValue.arrayUnion(todayStr),
                completedDate: todayStr
            });
        } else {
            goalRef.update({
                completedHabitDates: firebase.firestore.FieldValue.arrayRemove(todayStr),
                completedDate: null
            });
        }
    } else {
        goalRef.update({
            completed: toCompleted,
            completedDate: toCompleted ? todayStr : null
        });
    }

    const pointDiff = toCompleted ? 5 : -5;
    db.collection('users').doc(currentUser.uid).update({
        points: firebase.firestore.FieldValue.increment(pointDiff)
    });

    if (toCompleted) {
        showToast("تم الإنجاز بنجاح (+5 نقاط)");
    }
}

// --- 11. سجل الإنجاز والتوثيق والـ CSV ---
function openRecordsModal() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-records').classList.add('active');

    document.getElementById('header-title').innerText = 'سجل الإنجاز والتوثيق';
    document.getElementById('header-subtitle').innerText = 'عرض تفصيلي لتواريخ الإضافة والتنفيذ';

    document.getElementById('btn-back').style.display = 'flex';
    document.getElementById('bottom-nav-bar').style.display = 'none';

    renderRecordsTable();
}

function switchRecordsFilter(filter, btn) {
    recordsFilter = filter;
    document.querySelectorAll('#page-records .records-filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    const dynamicTitle = document.getElementById('records-col-dynamic-title');
    dynamicTitle.innerText = (filter === 'habit') ? 'العادة' : 'الهدف';

    renderRecordsTable();
}

function renderRecordsTable() {
    const query = (document.getElementById('records-search-input').value || '').trim().toLowerCase();
    const tbody = document.getElementById('records-table-body');
    tbody.innerHTML = "";

    let list = myGoals.filter(g => (recordsFilter === 'habit') ? (g.period === 'habit') : (g.period !== 'habit'));

    if (query) {
        list = list.filter(g => (g.title || '').toLowerCase().includes(query));
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:12px; color:#888;">لا توجد عناصر مطابقة</td></tr>`;
        return;
    }

    list.forEach(g => {
        const tr = document.createElement('tr');
        const addDate = g.createdDate || "غير مسجل";
        let doneDate = "—";

        if (g.period === 'habit') {
            const count = (g.completedHabitDates || []).length;
            doneDate = count > 0 ? `نُفذت ${count} مرة` : "لم تنفذ";
        } else {
            doneDate = g.completedDate || (g.completed ? "مكتمل" : "قيد التنفيذ");
        }

        tr.innerHTML = `
            <td style="font-weight:700; color:var(--dark-blue);">${g.title}</td>
            <td style="color:#64748b;">${addDate}</td>
            <td style="color:${doneDate.includes('—') || doneDate.includes('لم') ? '#94a3b8' : 'var(--success)'}; font-weight:700;">${doneDate}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterRecordsTable() {
    renderRecordsTable();
}

function exportRecordsToCSV() {
    if (myGoals.length === 0) return showToast("لا توجد بيانات لتصديرها", true);

    let csvContent = "\uFEFFالنوع,المسمى,التصنيف,تاريخ الإضافة,تاريخ التنفيذ\n";

    myGoals.forEach(g => {
        const isHabit = (g.period === 'habit');
        const category = isHabit ? 'عادة' : 'هدف';
        const tName = g.type === 'yly' ? 'YLY' : 'شخصي';
        const addDate = g.createdDate || "غير مسجل";
        let doneDate = g.completedDate || (g.completed ? "مكتمل" : "قيد التنفيذ");
        if (isHabit) {
            doneDate = `نُفذت ${(g.completedHabitDates || []).length} مرة`;
        }

        csvContent += `"${category}","${g.title.replace(/"/g, '""')}","${tName}","${addDate}","${doneDate}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `YLY_Report_${getTodayDateStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("تم تحميل التقرير بنجاح");
}

// --- 12. نظام بطاقة المشاركة المخصصة 1:1 بجودة فائقة w_1200 ---
function openShareModal(shareType) {
    if (!currentUserData.fullName) return showToast("جاري تحميل بياناتك...");

    document.getElementById('share-user-name').innerText = currentUserData.fullName || "عضو YLY";

    // استدعاء الصورة بدقة w_1200 لضمان النقاء الكريستالي
    const rawPhoto = currentUserData.photoURL || DEFAULT_SYSTEM_LOGO;
    document.getElementById('share-avatar-img').src = getHighResPhotoUrl(rawPhoto);

    const rank = getUserRankBadge(currentUserData.points);
    const badgeEl = document.getElementById('share-rank-badge');
    badgeEl.className = `rank-badge-tag ${rank.css}`;
    badgeEl.innerText = rank.title;

    const titleEl = document.getElementById('share-card-type-title');
    const lbl1 = document.getElementById('share-stat1-lbl');
    const val1 = document.getElementById('share-stat1-val');
    const lbl2 = document.getElementById('share-stat2-lbl');
    const val2 = document.getElementById('share-stat2-val');
    const lbl3 = document.getElementById('share-stat3-lbl');
    const val3 = document.getElementById('share-stat3-val');

    if (shareType === 'habits') {
        // تخصيص البطاقة لمشاركة العادات
        titleEl.innerText = 'تقرير عاداتي اليومية - YLY';
        const habits = myGoals.filter(g => g.period === 'habit');
        const total = habits.length;
        const done = habits.filter(g => isGoalCompletedCurrentCycle(g)).length;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;

        lbl1.innerText = 'عادات اليوم المنفذة';
        val1.innerText = done;
        lbl2.innerText = 'المتبقية اليوم';
        val2.innerText = total - done;
        lbl3.innerText = 'نسبة التزام اليوم';
        val3.innerText = rate + "%";
    } else {
        // تخصيص البطاقة لمشاركة الأهداف
        titleEl.innerText = 'تقرير أهدافي المحققة - YLY';
        const goalsOnly = myGoals.filter(g => g.period !== 'habit');
        const total = goalsOnly.length;
        const done = goalsOnly.filter(g => isGoalCompletedCurrentCycle(g)).length;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;

        lbl1.innerText = 'الأهداف المحققة';
        val1.innerText = done;
        lbl2.innerText = 'أهداف قيد التنفيذ';
        val2.innerText = total - done;
        lbl3.innerText = 'نسبة إنجاز الأهداف';
        val3.innerText = rate + "%";
    }

    document.getElementById('share-modal').style.display = 'flex';
}

function closeShareModal() {
    document.getElementById('share-modal').style.display = 'none';
}

function downloadShareCard() {
    showToast("جاري تحضير بطاقتك بدقة عالية...");
    const cardElement = document.getElementById('share-card-canvas');

    html2canvas(cardElement, {
        scale: 3, // دقة Retina HD فائقة
        useCORS: true,
        logging: false,
        backgroundColor: null
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `YLY_Achievement_${currentUserData.fullName || 'User'}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showToast("تم تنزيل بطاقة الإنجاز بدقة فائقة 🚀");
    }).catch(() => showToast("تعذر تحميل البطاقة", true));
}

// --- 13. بروفايل الزملاء ---
function openPublicProfile(userId, userData) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-public-profile').classList.add('active');

    document.getElementById('header-title').innerText = 'الملف الشخصي للعضو';
    document.getElementById('header-subtitle').innerText = 'استعراض الإنجازات والأهداف';

    document.getElementById('btn-back').style.display = 'flex';
    document.getElementById('bottom-nav-bar').style.display = 'none';

    document.getElementById('public-user-name').innerText = userData.fullName || "عضو";
    
    const pRank = getUserRankBadge(userData.points);
    document.getElementById('public-user-rank-box').innerHTML = `<span class="rank-badge-tag ${pRank.css}">${pRank.title}</span>`;
    
    document.getElementById('public-user-email').innerText = userData.email || "";
    document.getElementById('public-user-phone').innerText = userData.phone ? "هاتف: " + userData.phone : "";
    
    const pubPhoto = userData.photoURL || DEFAULT_SYSTEM_LOGO;
    document.getElementById('public-user-avatar').src = pubPhoto;

    const ylyBox = document.getElementById('public-yly-container');
    const perBox = document.getElementById('public-personal-container');
    ylyBox.innerHTML = "<div style='font-size:0.68rem; color:#888;'>جاري التحميل...</div>";
    perBox.innerHTML = "<div style='font-size:0.68rem; color:#888;'>جاري التحميل...</div>";

    db.collection('users').doc(userId).collection('goals').get().then(snap => {
        publicUserGoals = [];
        snap.forEach(d => publicUserGoals.push({ id: d.id, ...d.data() }));
        renderPublicUserGoals();
    });
}

function switchPublicControlView(mode, btn) {
    publicControlView = mode;
    document.querySelectorAll('#page-public-profile .period-tab-duo').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    if (mode === 'habits') {
        document.getElementById('pub-col-title-yly').innerText = 'عادات YLY';
        document.getElementById('pub-col-title-personal').innerText = 'عادات شخصية';
    } else {
        document.getElementById('pub-col-title-yly').innerText = 'أهداف YLY';
        document.getElementById('pub-col-title-personal').innerText = 'أهداف شخصية';
    }

    renderPublicUserGoals();
}

function renderPublicUserGoals() {
    const ylyBox = document.getElementById('public-yly-container');
    const perBox = document.getElementById('public-personal-container');
    ylyBox.innerHTML = "";
    perBox.innerHTML = "";

    const isHabit = (publicControlView === 'habits');
    const filtered = publicUserGoals.filter(g => isHabit ? (g.period === 'habit') : (g.period !== 'habit'));

    if (filtered.length === 0) {
        ylyBox.innerHTML = `<div style='font-size:0.65rem; color:#aaa; text-align:center;'>لا توجد ${isHabit ? 'عادات' : 'أهداف'}</div>`;
        perBox.innerHTML = `<div style='font-size:0.65rem; color:#aaa; text-align:center;'>لا توجد ${isHabit ? 'عادات' : 'أهداف'}</div>`;
        return;
    }

    filtered.forEach(g => {
        const isDone = isGoalCompletedCurrentCycle(g);
        const item = document.createElement('div');
        item.className = 'goal-item';
        const iconHtml = isDone 
            ? `<i class="fa-solid fa-square-check" style="color: var(--success); font-size: 0.82rem;"></i>`
            : `<i class="fa-regular fa-square" style="color: #cbd5e1; font-size: 0.82rem;"></i>`;

        item.innerHTML = `
            ${iconHtml}
            <span style="${isDone ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${g.title}</span>
        `;
        if (g.type === 'yly') ylyBox.appendChild(item);
        else perBox.appendChild(item);
    });
}

// --- 14. سجل الدعم السريع المحصن برمجياً ---
function loadUserSupportHistory() {
    db.collection('problems').where('userId', '==', currentUser.uid).onSnapshot(snap => {
        const box = document.getElementById('user-support-history');
        box.innerHTML = "";

        if (snap.empty) {
            box.innerHTML = "<div style='text-align:center; padding:10px; font-size:0.75rem; color:#888;'>لم تقم بإرسال أي بلاغات سابقة.</div>";
            return;
        }

        let problemsList = [];
        snap.forEach(doc => {
            problemsList.push({ id: doc.id, ...doc.data() });
        });

        problemsList.sort((a, b) => {
            const timeA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : (a.localTime || Date.now());
            const timeB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : (b.localTime || Date.now());
            return timeB - timeA;
        });

        problemsList.forEach(p => {
            let dateStr = "الآن";
            if (p.timestamp && p.timestamp.toDate) {
                const d = p.timestamp.toDate();
                dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
            }
            const isResolved = p.status === 'Resolved';
            const badgeClass = isResolved ? 'badge-resolved' : 'badge-pending';
            const badgeText = isResolved ? 'تم الحل 🟢' : 'قيد المراجعة 🟡';

            const item = document.createElement('div');
            item.className = 'support-history-item';
            item.innerHTML = `
                <div class="support-history-header">
                    <span class="support-badge ${badgeClass}">${badgeText}</span>
                    <span style="color:#888; font-size:0.65rem;">${dateStr}</span>
                </div>
                <div style="color:#334155; line-height:1.35;">${p.description}</div>
            `;
            box.appendChild(item);
        });
    }, err => {
        document.getElementById('user-support-history').innerHTML = "<div style='text-align:center; padding:10px; font-size:0.75rem; color:#888;'>لا توجد بلاغات مسجلة.</div>";
    });
}

function submitProblem() {
    const text = document.getElementById('problem-input').value.trim();
    if (!text) return showToast("يرجى كتابة تفاصيل المشكلة", true);

    db.collection('problems').add({
        userId: currentUser.uid,
        userName: currentUserData.fullName || "مستخدم",
        description: text,
        status: "Pending",
        localTime: Date.now(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        document.getElementById('problem-input').value = "";
        showToast("تم إرسال المشكلة بنجاح وظهرت بسجلك");
    }).catch(() => showToast("فشل في إرسال المشكلة", true));
}

// --- 15. قائمة الزملاء في الرئيسية ولوحة الشرف ---
function loadSharedMembers() {
    db.collection('users').limit(30).onSnapshot(snap => {
        const list = document.getElementById('shared-goals-list');
        list.innerHTML = "";

        let hasOthers = false;
        snap.forEach(doc => {
            if (doc.id === currentUser.uid) return;
            hasOthers = true;
            const u = doc.data();

            let joinDate = "جديد";
            if (u.createdAt && u.createdAt.toDate) {
                const d = u.createdAt.toDate();
                joinDate = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
            }

            const card = document.createElement('div');
            card.className = 'member-card';
            card.onclick = () => openPublicProfile(doc.id, u);

            const mPhoto = u.photoURL || DEFAULT_SYSTEM_LOGO;

            card.innerHTML = `
                <img src="${mPhoto}" class="member-avatar" onclick="event.stopPropagation(); openImageViewer(this.src)">
                <div class="member-details-col">
                    <div class="member-row-top">
                        <span class="member-name">${u.fullName || 'عضو من YLY'}</span>
                        <span class="member-date">${joinDate}</span>
                    </div>
                    <div class="member-row-bottom">
                        <span class="member-action-hint">انقر لعرض البروفايل</span>
                        <span class="member-stats-info" id="stats-user-${doc.id}">المنفذة: ..</span>
                    </div>
                </div>
            `;
            list.appendChild(card);

            db.collection('users').doc(doc.id).collection('goals').get().then(gSnap => {
                let comp = 0;
                gSnap.forEach(gDoc => {
                    const gd = gDoc.data();
                    if (gd.period !== 'habit' && isGoalCompletedCurrentCycle(gd)) comp++;
                });
                const el = document.getElementById(`stats-user-${doc.id}`);
                if (el) el.innerText = `المنفذة: ${comp}`;
            });
        });

        if (!hasOthers) {
            list.innerHTML = "<div style='text-align:center; padding:12px; font-size:0.75rem; color:#777;'>لا يوجد أعضاء آخرين مسجلين حالياً.</div>";
        }
    });
}

function loadLeaderboard() {
    db.collection('users').orderBy('points', 'desc').limit(15).onSnapshot(snap => {
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = "";
        let rank = 1;

        snap.forEach(doc => {
            const u = doc.data();
            const item = document.createElement('div');
            item.className = 'leaderboard-card';
            item.onclick = () => openPublicProfile(doc.id, u);

            let badgeClass = "rank-regular";
            if (rank === 1) badgeClass = "";
            else if (rank === 2) badgeClass = "rank-secondary";
            else if (rank === 3) badgeClass = "rank-bronze";

            const lbPhoto = u.photoURL || DEFAULT_SYSTEM_LOGO;

            item.innerHTML = `
                <div class="rank-circle-badge ${badgeClass}">#${rank}</div>
                <img src="${lbPhoto}" class="member-avatar" onclick="event.stopPropagation(); openImageViewer(this.src)">
                <div class="lb-center">
                    <div class="lb-name">${u.fullName || 'عضو متألق'}</div>
                    <div class="lb-points">النقاط: ${u.points || 0}</div>
                </div>
                <div class="lb-left">
                    <div class="lb-left-label">الأهداف المحققة</div>
                    <div class="lb-left-val" id="lb-goals-${doc.id}">..</div>
                </div>
            `;
            list.appendChild(item);

            db.collection('users').doc(doc.id).collection('goals').get().then(cSnap => {
                let count = 0;
                cSnap.forEach(cd => {
                    const d = cd.data();
                    if (d.period !== 'habit' && isGoalCompletedCurrentCycle(d)) count++;
                });
                const targetEl = document.getElementById(`lb-goals-${doc.id}`);
                if (targetEl) targetEl.innerText = count;
            });

            rank++;
        });

        if (list.innerHTML === "") {
            list.innerHTML = "<div style='text-align:center; padding:10px; font-size:0.75rem; color:#888;'>لا توجد بيانات متاحة حالياً</div>";
        }
    });
}

function uploadProfileImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);

    showToast("جاري رفع الصورة الشخصية...");
    fetch(CLOUDINARY_URL, { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.secure_url) {
                return db.collection('users').doc(currentUser.uid).update({ photoURL: data.secure_url });
            }
        })
        .then(() => showToast("تم تحديث الصورة الشخصية"))
        .catch(() => showToast("فشل رفع الصورة", true));
}

function handleLogout() { auth.signOut(); }

function switchLeaderboardTab(el) {
    document.querySelectorAll('#page-leaderboard .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}