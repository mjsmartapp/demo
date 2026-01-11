import { db } from './firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- CHECK SESSION ON LOAD ---
window.addEventListener('load', () => {
    // Check if user is already logged in
    const sessionRole = localStorage.getItem('ssvms_role');
    const sessionUser = localStorage.getItem('ssvms_user');

    if (sessionRole && sessionUser) {
        console.log("Session found, redirecting...");
        // Keep loader visible while redirecting
        redirectToDashboard(sessionRole);
    } else {
        // No session found, remove loader after animation
        setTimeout(() => {
            const loader = document.getElementById('loader-wrapper');
            if(loader) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 500);
            }
        }, 2500);
    }
});

// --- HELPER: Redirect Logic ---
function redirectToDashboard(role) {
    const pages = {
        'admin': 'admin.html',
        'principal': 'principal.html',
        'manager': 'manager.html',
        'staff': 'staff.html',
        'student': 'student.html'
    };
    // Default to admin if role is undefined, or perform safe check
    const targetPage = pages[role] || 'admin.html';
    window.location.href = targetPage;
}

// --- HELPER: Button Loading State ---
const setLoading = (btnId, isLoading, text) => {
    const btn = document.getElementById(btnId);
    if(isLoading) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
        btn.disabled = true;
        btn.style.opacity = '0.7';
    } else {
        btn.innerHTML = text;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

// --- DOM ELEMENTS ---
const btnLogin = document.getElementById('btnLogin');
const closeModalBtn = document.getElementById('closeModalBtn');

// --- UTILITIES ---
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

if(closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        document.getElementById('profile-select-modal').style.display = 'none';
        setLoading('btnLogin', false, `<span>Sign In</span> <i class="fas fa-arrow-right"></i>`);
    });
}

// --- LOGIN LOGIC ---
btnLogin.addEventListener('click', async () => {
    const loginId = document.getElementById('loginId').value.trim();
    const dob = document.getElementById('loginDob').value;

    if (!loginId || !dob) {
        showError('loginError', "Please enter credentials.");
        return;
    }

    setLoading('btnLogin', true, '');

    try {
        const usersRef = collection(db, "users");
        
        // 1. Fetch matching Email OR Phone
        // Note: Firestore doesn't support 'OR' queries easily in v9 without 'or()' method, 
        // so we run two parallel queries to be safe and cover siblings sharing different parents' info.
        const qEmail = query(usersRef, where("email", "==", loginId));
        const qPhone = query(usersRef, where("phone", "==", loginId));

        const [snapEmail, snapPhone] = await Promise.all([getDocs(qEmail), getDocs(qPhone)]);

        if (snapEmail.empty && snapPhone.empty) {
            throw new Error("User not found.");
        }

        // 2. Filter Results by DOB
        const matchedUsers = [];
        const processDoc = (doc) => {
            const data = doc.data();
            // Check DOB match
            if (data.dob === dob) {
                // Avoid duplicates if email and phone are the same
                if (!matchedUsers.find(u => u.id === doc.id)) {
                    matchedUsers.push({ id: doc.id, ...data });
                }
            }
        };

        snapEmail.forEach(processDoc);
        snapPhone.forEach(processDoc);

        // 3. Handle Matches
        if (matchedUsers.length === 0) {
            throw new Error("Incorrect Date of Birth.");
        } else if (matchedUsers.length === 1) {
            // SINGLE USER FOUND
            loginUser(matchedUsers[0]);
        } else {
            // MULTIPLE USERS FOUND (Twins/Siblings with same DOB)
            showProfileSelection(matchedUsers);
        }

    } catch (e) {
        console.error("Login Error:", e);
        showError('loginError', e.message);
        setLoading('btnLogin', false, `<span>Sign In</span> <i class="fas fa-arrow-right"></i>`);
    }
});

// --- SHOW PROFILE SELECTION MODAL ---
function showProfileSelection(users) {
    const modal = document.getElementById('profile-select-modal');
    const list = document.getElementById('profile-list');
    list.innerHTML = ''; // Clear previous

    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'profile-card';
        div.innerHTML = `
            <div class="profile-avatar"><i class="fas fa-user-graduate"></i></div>
            <div class="profile-name">${user.name}</div>
            <div class="profile-class">${user.studentClass || 'N/A'} - ${user.section || ''}</div>
        `;
        div.onclick = () => {
            modal.style.display = 'none';
            loginUser(user);
        };
        list.appendChild(div);
    });

    modal.style.display = 'flex';
}

// --- FINAL LOGIN STEP ---
function loginUser(user) {
    // 1. SAVE SESSION
    localStorage.setItem('ssvms_user', user.name);
    localStorage.setItem('ssvms_role', user.role);
    
    // For Students: Save specific details for the dashboard
    if (user.role === 'student') {
        localStorage.setItem('ssvms_student_profile_id', user.id);
        localStorage.setItem('ssvms_student_class', user.studentClass);
        localStorage.setItem('ssvms_student_section', user.section);
    }

    // 2. REDIRECT
    setTimeout(() => {
         redirectToDashboard(user.role);
    }, 500);
}