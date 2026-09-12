/* ==========================================================================
   لوحة تحكم المشرف YLY - ملف الجافاسكريبت (admin-app.js)
   ========================================================================== */

// --- 1. إعدادات Firebase ---
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

// مفتاح وصلاحية الآدمن الصارمة
const ADMIN_UID = "6Qi1KnU1NcTV48e14FywWzzmX7f1";
const DEFAULT_SYSTEM_LOGO = "https://res.cloudinary.com/dsxrjmcxs/image/upload/c_limit,w_1200,q_auto,f_auto/v1789071039/ecmjgwmjnhyvfpviggwx.png";

let allUsersData = [];
let allProblemsData = [];

let totalHabitsDone = 0;
let totalHabitsCount = 0;
let totalGoalsDone = 0;
let totalGoalsCount = 0;

// --- 2. دوال مساعدة ---
function showToast(msg, isErr = false) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.className = `toast show ${isErr ? 'error' : ''}`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

function getUserRankBadge(points) {
    const p = points || 0;
    if (p >= 600) return { title: 'أسطورة 👑', css: 'badge-legend' };
    if (p >= 300) return { title: 'بطل 🥇', css: 'badge-gold' };
    if (p >= 100) return { title: 'مثابر 🥈', css: 'badge-silver' };
    return { title: 'مبتدئ 🥉', css: 'badge-bronze' };
}

function getTodayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- 3. التحقق من صلاحيات المشرف ومصادقة الدخول ---
auth.onAuthStateChanged(user => {
    if (user && user.uid === ADMIN_UID) {
        document.getElementById('admin-auth-screen').style.display = 'none';
        loadAdminDashboardData();
    } else {
        document.getElementById('admin-auth-screen').style.display = 'flex';
    }
});

function handleAdminLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-admin-login');
    const originalText = btn.innerText;

    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;

    btn.innerText = "جاري التحقق...";
    btn.disabled = true;

    auth.signInWithEmailAndPassword(email, pass)
        .then(res => {
            if (res.user.uid !== ADMIN_UID) {
                auth.signOut();
                showToast("حسابك غير مصرح له كآدمن", true);
                btn.innerText = originalText;
                btn.disabled = false;
            }
        })
        .catch(() => {
            showToast("بيانات دخول المشرف غير صحيحة", true);
            btn.innerText = originalText;
            btn.disabled = false;
        });
}

function handleAdminLogout() {
    auth.signOut();
}

// --- 4. التبديل بين أقسام لوحة الإدارة ---
function switchAdminTab(secId, btn) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));

    document.getElementById('section-' + secId).classList.add('active');
    btn.classList.add('active');

    const searchBox = document.getElementById('admin-search-container');
    if (secId === 'stats') {
        searchBox.style.display = 'none';
    } else {
        searchBox.style.display = 'block';
    }
}

// --- 5. تحميل بيانات لوحة الإدارة الشاملة ---
function loadAdminDashboardData() {
    const todayStr = getTodayDateStr();

    // تحميل الأعضاء وحساب العادات والأهداف بشكل فوري ولحظي
    db.collection('users').onSnapshot(snap => {
        allUsersData = [];
        totalHabitsDone = 0;
        totalHabitsCount = 0;
        totalGoalsDone = 0;
        totalGoalsCount = 0;

        let promises = [];

        snap.forEach(doc => {
            const u = { id: doc.id, ...doc.data() };
            allUsersData.push(u);

            const p = db.collection('users').doc(doc.id).collection('goals').get().then(gSnap => {
                let hDone = 0, hTotal = 0, gDone = 0, gTotal = 0;

                gSnap.forEach(gDoc => {
                    const g = gDoc.data();
                    if (g.period === 'habit') {
                        hTotal++;
                        totalHabitsCount++;
                        if ((g.completedHabitDates || []).includes(todayStr)) {
                            hDone++;
                            totalHabitsDone++;
                        }
                    } else {
                        gTotal++;
                        totalGoalsCount++;
                        if (g.completed) {
                            gDone++;
                            totalGoalsDone++;
                        }
                    }
                });

                u.habitsCount = hTotal;
                u.habitsDone = hDone;
                u.goalsCount = gTotal;
                u.goalsDone = gDone;
            });
            promises.push(p);
        });

        Promise.all(promises).then(() => {
            updateStatsDisplay();
            renderMembersList(allUsersData);
            renderTopThree();
        });
    });

    // تحميل المشكلات والدعم بدون أي تعليق وفرزها من الأحدث للأقدم
    db.collection('problems').onSnapshot(snap => {
        allProblemsData = [];
        snap.forEach(doc => allProblemsData.push({ id: doc.id, ...doc.data() }));

        allProblemsData.sort((a, b) => {
            const tA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : (a.localTime || 0);
            const tB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : (b.localTime || 0);
            return tB - tA;
        });

        document.getElementById('cnt-problems').innerText = allProblemsData.length;
        renderSupportList(allProblemsData);
    });
}

// --- 6. تحديث العدادات والدائرتين التوأم للآدمن ---
function updateStatsDisplay() {
    document.getElementById('cnt-users').innerText = allUsersData.length;
    document.getElementById('cnt-habits-done').innerText = totalHabitsDone;
    document.getElementById('cnt-goals-done').innerText = totalGoalsDone;

    const habitRate = totalHabitsCount > 0 ? Math.round((totalHabitsDone / totalHabitsCount) * 100) : 0;
    const goalRate = totalGoalsCount > 0 ? Math.round((totalGoalsDone / totalGoalsCount) * 100) : 0;

    document.getElementById('admin-text-habits').innerText = habitRate + "%";
    document.getElementById('admin-chart-habits').style.background = 
        `conic-gradient(var(--success) 0% ${habitRate}%, rgba(255,255,255,0.15) ${habitRate}% 100%)`;

    document.getElementById('admin-text-goals').innerText = goalRate + "%";
    document.getElementById('admin-chart-goals').style.background = 
        `conic-gradient(var(--success) 0% ${goalRate}%, rgba(255,255,255,0.15) ${goalRate}% 100%)`;

    document.getElementById('admin-summary-desc').innerText = `العادات: ${totalHabitsDone}/${totalHabitsCount} | الأهداف: ${totalGoalsDone}/${totalGoalsCount}`;
}

// --- 7. قائمة الشرف للثلاثة الأوائل ---
function renderTopThree() {
    const sorted = [...allUsersData].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3);
    const box = document.getElementById('top-three-container');
    box.innerHTML = "";

    if (sorted.length === 0) {
        box.innerHTML = "<div style='text-align:center; padding:10px; font-size:0.75rem; color:#888;'>لا يوجد بيانات بعد</div>";
        return;
    }

    const colors = ['linear-gradient(135deg, #ffd700, var(--accent-gold))', 'linear-gradient(135deg, #c0c0c0, #94a3b8)', 'linear-gradient(135deg, #cd7f32, #a05a2c)'];

    sorted.forEach((u, idx) => {
        const rankInfo = getUserRankBadge(u.points);
        const userImg = u.photoURL || DEFAULT_SYSTEM_LOGO;

        const div = document.createElement('div');
        div.className = 'top-member-item';
        div.innerHTML = `
            <div class="rank-medal" style="background:${colors[idx]};">#${idx + 1}</div>
            <img src="${userImg}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid #cbd5e1;">
            <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:0.75rem; color:#1e293b;">${u.fullName || 'عضو'}</strong>
                    <span class="rank-badge-tag ${rankInfo.css}">${rankInfo.title}</span>
                </div>
                <div style="font-size:0.62rem; color:#64748b;">النقاط: ${u.points || 0} | الأهداف المنجزة: ${u.goalsDone || 0}</div>
            </div>
        `;
        box.appendChild(div);
    });
}

function filterTopThree(type, tab) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderTopThree();
}

// --- 8. إدارة وقائمة الأعضاء ---
function renderMembersList(users) {
    const container = document.getElementById('admin-members-list');
    container.innerHTML = "";

    if (users.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:15px; font-size:0.75rem; color:#888;'>لا يوجد أعضاء مطابقين للبحث</div>";
        return;
    }

    users.forEach(u => {
        let joinDate = "جديد";
        if (u.createdAt && u.createdAt.toDate) {
            const d = u.createdAt.toDate();
            joinDate = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
        }

        let phoneClean = (u.phone || '').replace(/\D/g, '');
        if (phoneClean.startsWith('01')) phoneClean = '2' + phoneClean;

        const rankInfo = getUserRankBadge(u.points);
        const userImg = u.photoURL || DEFAULT_SYSTEM_LOGO;

        const card = document.createElement('div');
        card.className = 'admin-member-card';
        card.id = `member-card-${u.id}`;

        card.innerHTML = `
            <div class="member-header-row">
                <img src="${userImg}" class="member-avatar">
                <div class="member-info-col">
                    <div class="member-name-row">
                        <span class="member-name">${u.fullName || 'بدون اسم'}</span>
                        <span class="rank-badge-tag ${rankInfo.css}">${rankInfo.title}</span>
                    </div>
                    <div class="member-sub-row">
                        <span>هاتف: ${u.phone || 'غير مسجل'}</span>
                        <span style="font-weight:700; color:var(--dark-blue);">النقاط: ${u.points || 0}</span>
                    </div>
                    <div class="member-sub-row">
                        <span>انضمام: ${joinDate}</span>
                        <span>العادات: ${u.habitsCount || 0} | الأهداف المنفذة: ${u.goalsDone || 0}</span>
                    </div>
                </div>
            </div>

            <!-- سطر الإجراءات الثلاثي -->
            <div class="action-row" id="action-row-${u.id}">
                <button class="action-btn btn-edit" onclick="toggleEditMember('${u.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
                <button class="action-btn btn-delete" onclick="showDeleteConfirm('${u.id}')"><i class="fa-solid fa-trash"></i> حذف</button>
                <a href="https://wa.me/${phoneClean}" target="_blank" class="action-btn btn-wa"><i class="fa-brands fa-whatsapp"></i> تواصل</a>
            </div>

            <!-- نموذج التعديل المنسدل مع إمكانية تعديل النقاط الإدارية -->
            <div class="member-inline-edit" id="edit-box-${u.id}">
                <div class="form-group">
                    <label>الاسم الكامل</label>
                    <input type="text" id="input-name-${u.id}" class="form-control" value="${u.fullName || ''}">
                </div>
                <div class="form-group">
                    <label>رقم الهاتف</label>
                    <input type="tel" id="input-phone-${u.id}" class="form-control" value="${u.phone || ''}">
                </div>
                <div class="form-group">
                    <label>البريد الإلكتروني</label>
                    <input type="email" id="input-email-${u.id}" class="form-control" value="${u.email || ''}">
                </div>
                <div class="form-group">
                    <label>النقاط الإدارية (تحدد الرتبة مباشرة)</label>
                    <input type="number" id="input-points-${u.id}" class="form-control" value="${u.points || 0}">
                </div>
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <button class="btn-main btn-save-custom" style="margin:0;" onclick="saveMemberData('${u.id}')">حفظ التعديلات</button>
                    <button class="btn-main" style="margin:0; background:#64748b;" onclick="toggleEditMember('${u.id}')">إلغاء</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// نظام تأكيد الحذف بتحويل السطر فورياً
function showDeleteConfirm(uid) {
    const row = document.getElementById(`action-row-${uid}`);
    row.innerHTML = `
        <button class="action-btn btn-confirm-del" onclick="confirmDeleteMember('${uid}')"><i class="fa-solid fa-check"></i> تأكيد الحذف</button>
        <button class="action-btn btn-cancel-del" onclick="cancelDeleteRow('${uid}')"><i class="fa-solid fa-xmark"></i> تراجع</button>
    `;
}

function cancelDeleteRow(uid) {
    const u = allUsersData.find(x => x.id === uid);
    let phoneClean = (u.phone || '').replace(/\D/g, '');
    if (phoneClean.startsWith('01')) phoneClean = '2' + phoneClean;

    const row = document.getElementById(`action-row-${uid}`);
    row.innerHTML = `
        <button class="action-btn btn-edit" onclick="toggleEditMember('${uid}')"><i class="fa-solid fa-pen"></i> تعديل</button>
        <button class="action-btn btn-delete" onclick="showDeleteConfirm('${uid}')"><i class="fa-solid fa-trash"></i> حذف</button>
        <a href="https://wa.me/${phoneClean}" target="_blank" class="action-btn btn-wa"><i class="fa-brands fa-whatsapp"></i> تواصل</a>
    `;
}

function confirmDeleteMember(uid) {
    db.collection('users').doc(uid).delete()
        .then(() => showToast("تم حذف العضو نهائياً"))
        .catch(() => showToast("حدث خطأ أثناء الحذف", true));
}

function toggleEditMember(uid) {
    const box = document.getElementById(`edit-box-${uid}`);
    box.style.display = (box.style.display === 'block') ? 'none' : 'block';
}

function saveMemberData(uid) {
    const name = document.getElementById(`input-name-${uid}`).value.trim();
    const phone = document.getElementById(`input-phone-${uid}`).value.trim();
    const email = document.getElementById(`input-email-${uid}`).value.trim();
    const points = parseInt(document.getElementById(`input-points-${uid}`).value) || 0;

    if (!name) return showToast("الاسم مطلوب", true);

    db.collection('users').doc(uid).update({
        fullName: name,
        phone: phone,
        email: email,
        points: points
    }).then(() => {
        showToast("تم تحديث بيانات العضو بنجاح");
        toggleEditMember(uid);
    }).catch(() => showToast("فشل التحديث", true));
}

// البحث الذكي بالاسم أو الهاتف
function handleAdminSearch() {
    const query = document.getElementById('admin-search-input').value.trim().toLowerCase();
    const filtered = allUsersData.filter(u => 
        (u.fullName || '').toLowerCase().includes(query) || 
        (u.phone || '').includes(query)
    );
    renderMembersList(filtered);
}

// --- 9. إدارة رسائل الدعم والمشاكل ---
function renderSupportList(problems) {
    const box = document.getElementById('admin-support-list');
    box.innerHTML = "";

    if (problems.length === 0) {
        box.innerHTML = "<div style='text-align:center; padding:15px; font-size:0.75rem; color:#888;'>لا توجد رسائل دعم حالياً</div>";
        return;
    }

    problems.forEach(p => {
        const u = allUsersData.find(x => x.id === p.userId) || {};
        let phoneClean = (u.phone || '').replace(/\D/g, '');
        if (phoneClean.startsWith('01')) phoneClean = '2' + phoneClean;

        let dateStr = "حديث";
        if (p.timestamp && p.timestamp.toDate) {
            const d = p.timestamp.toDate();
            dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
        }

        const isResolved = p.status === 'Resolved';

        const card = document.createElement('div');
        card.className = 'support-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:0.8rem; color:var(--dark-blue);">${p.userName || u.fullName || 'عضو'}</strong>
                <span style="font-size:0.62rem; color:${isResolved ? 'var(--success)' : 'var(--dark-orange)'}; font-weight:700;">${isResolved ? 'تم الحل 🟢' : 'قيد المراجعة 🟡'}</span>
            </div>
            <div style="font-size:0.65rem; color:#64748b; margin-top:2px; display:flex; justify-content:space-between;">
                <span>هاتف: ${u.phone || 'غير مسجل'}</span>
                <span style="color:#94a3b8;">${dateStr}</span>
            </div>
            <div class="problem-text-box">
                <i class="fa-solid fa-triangle-exclamation" style="margin-left:4px;"></i>
                ${p.description}
            </div>
            <div style="display:flex; gap:6px;">
                <a href="https://wa.me/${phoneClean}" target="_blank" class="action-btn btn-wa" style="flex:2;"><i class="fa-brands fa-whatsapp"></i> تواصل لحل المشكلة</a>
                <button class="action-btn btn-edit" style="flex:1;" onclick="toggleProblemStatus('${p.id}', '${p.status || 'Pending'}')">
                    <i class="fa-solid fa-check"></i> ${isResolved ? 'إعادة فتح' : 'تم الحل'}
                </button>
                <button class="action-btn btn-delete" style="flex:0.6;" onclick="deleteProblem('${p.id}')" title="حذف التذكرة">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        box.appendChild(card);
    });
}

function toggleProblemStatus(id, currentStatus) {
    const nextStatus = (currentStatus === 'Resolved') ? 'Pending' : 'Resolved';
    db.collection('problems').doc(id).update({ status: nextStatus })
        .then(() => showToast("تم تحديث حالة التذكرة"));
}

function deleteProblem(id) {
    if (confirm("هل تريد حذف تذكرة الدعم هذه نهائياً؟")) {
        db.collection('problems').doc(id).delete()
            .then(() => showToast("تم حذف التذكرة بنجاح"));
    }
}