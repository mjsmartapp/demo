/* =========================================
   FIREBASE CONFIGURATION
   ========================================= */
const firebaseConfig = {
    apiKey: "AIzaSyAJ7vzd-VM4YkRziVUgEhBqeoe1-qBcf90",
    authDomain: "supermarket-2f366.firebaseapp.com",
    databaseURL: "https://supermarket-2f366-default-rtdb.firebaseio.com",
    projectId: "supermarket-2f366",
    storageBucket: "supermarket-2f366.firebasestorage.app",
    messagingSenderId: "197111735515",
    appId: "1:197111735515:web:c6e332ab82a9680c8ed8fe"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();
const DELIVERY_CHARGE = 50;

/* =========================================
   APP STATE MANAGEMENT
   ========================================= */
const appState = {
    currentUser: null,
    cart: JSON.parse(localStorage.getItem('cart')) || {},
    products: [],
    categories: [
        { id: 'groceries', name: 'Groceries', icon: 'fas fa-shopping-basket' },
        { id: 'vegfruits', name: 'Fresh Farm', icon: 'fas fa-carrot' },
        { id: 'icejuice', name: 'Beverages', icon: 'fas fa-glass-martini-alt' },
        { id: 'snacksmed', name: 'Snacks', icon: 'fas fa-cookie-bite' },
        { id: 'hotel', name: 'Gourmet', icon: 'fas fa-utensils' },
        { id: 'meat', name: 'Meats', icon: 'fas fa-drumstick-bite' },
        { id: 'fishes', name: 'Seafood', icon: 'fas fa-fish' }
    ],
    currentCategory: null,
    ads: [],
    currentLocation: { lat: null, lng: null },
    confirmationResult: null // For Phone Auth
};

/* =========================================
   DOM ELEMENTS
   ========================================= */
const elements = {
    loaderBar: document.getElementById('loader-bar'),
    // Header & Nav
    hamburger: document.getElementById('hamburger'),
    drawer: document.getElementById('drawer'),
    drawerOverlay: document.getElementById('drawer-overlay'),
    closeDrawerBtn: document.getElementById('close-drawer-btn'),
    drawerItems: document.querySelectorAll('.drawer-menu li'),
    navBtns: document.querySelectorAll('.nav-btn'),
    
    // Auth & Profile
    authBtn: document.getElementById('auth-btn'),
    profileSection: document.getElementById('profile-section'),
    logoutDrawerBtn: document.getElementById('logout-drawer-btn'),
    loginModal: document.getElementById('login-modal'),
    closeLoginModal: document.getElementById('close-login-modal'),
    
    // Cart
    cartBtn: document.getElementById('cart-btn'),
    cartCount: document.getElementById('cart-count'),
    cartDrawer: document.getElementById('cart-drawer'),
    cartDrawerOverlay: document.getElementById('cart-drawer-overlay'),
    closeCartBtn: document.getElementById('close-cart-btn'),
    cartItems: document.getElementById('cart-items'),
    cartSubtotal: document.getElementById('cart-subtotal'),
    checkoutBtn: document.getElementById('checkout-btn'),
    
    // Checkout Form
    checkoutForm: document.getElementById('checkout-form'),
    checkoutName: document.getElementById('checkout-name'),
    checkoutPhone: document.getElementById('checkout-phone'),
    checkoutAddress: document.getElementById('checkout-address'),
    checkoutEmail: document.getElementById('checkout-email'),
    checkoutSubtotal: document.getElementById('checkout-subtotal'),
    checkoutTotal: document.getElementById('checkout-total'),
    
    // Views
    bannerSlider: document.getElementById('banner-slider'),
    categoryList: document.getElementById('category-list'),
    productsGrid: document.getElementById('products-grid'),
    homeProductsGrid: document.getElementById('home-products-grid'),
    popularProductsGrid: document.getElementById('popular-products-grid'),
    productsTitle: document.getElementById('products-title'),
    ordersList: document.getElementById('orders-list'),
    queriesForm: document.getElementById('queries-form'),
    profileInfo: document.getElementById('profile-info'),
    cartViewItems: document.getElementById('cart-view-items'),
    
    // Misc
    toastContainer: document.getElementById('toast-container'),
    searchBtn: document.getElementById('search-btn'),
    headerSearchContainer: document.getElementById('header-search-container'),
    searchInput: document.getElementById('searchInput'),
    locationDisplay: document.getElementById('location-display'),
    currentLocationText: document.getElementById('current-location-text'),
    changeLocationBtn: document.getElementById('change-location-btn'),
    detectAddressBtn: document.getElementById('detect-address-btn'),
    
    // Profile Edit
    editProfileBtn: document.getElementById('edit-profile-btn'),
    updateProfileForm: document.getElementById('update-profile-form'),
    updateName: document.getElementById('update-name'),
    updateEmail: document.getElementById('update-email'),
    updatePhone: document.getElementById('update-phone'),
    updateAddress: document.getElementById('update-address'),
    profileMapBtn: document.getElementById('profile-map-btn'),
    profileLogoutBtn: document.getElementById('profile-logout-btn'),
    
    // Map
    mapContainer: document.getElementById('map-container'),
    saveLocationBtn: document.getElementById('save-location-btn'),
    detectLocationBtn: document.getElementById('detect-location-btn'),

    // Phone Auth
    googleLoginBtn: document.getElementById('google-login-btn'),
    loginPhone: document.getElementById('loginPhone'),
    sendOtpBtn: document.getElementById('send-otp-btn'),
    phoneStep1: document.getElementById('phone-step-1'),
    phoneStep2: document.getElementById('phone-step-2'),
    loginOtp: document.getElementById('loginOtp'),
    verifyOtpBtn: document.getElementById('verify-otp-btn'),
    backToPhoneBtn: document.getElementById('back-to-phone-btn')
};

/* =========================================
   UTILITIES & UI LOGIC
   ========================================= */

function showLoader() { elements.loaderBar.style.width = '40%'; }
function hideLoader() { 
    elements.loaderBar.style.width = '100%'; 
    setTimeout(() => elements.loaderBar.style.width = '0', 400); 
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Geolocation Helper
function getCurrentLocation(timeout = 5000) {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null });
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve({ lat: null, lng: null }),
            { timeout }
        );
    });
}

// Navigation / View Switching
function switchView(viewId, skipHistory = false) {
    // Determine target ID (handle suffix)
    const targetId = viewId.endsWith('-view') ? viewId : `${viewId}-view`;
    const cleanName = targetId.replace('-view', '');

    // Hide all views
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    
    // Show target view
    const targetEl = document.getElementById(targetId);
    if(targetEl) targetEl.classList.add('active');

    // Update Nav States
    elements.drawerItems.forEach(item => {
        if(item.dataset.view === cleanName) item.classList.add('active');
        else item.classList.remove('active');
    });
    
    elements.navBtns.forEach(btn => {
        if(btn.dataset.view === cleanName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Close Drawers
    closeDrawer();
    closeCartDrawer();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (!skipHistory) {
        history.pushState({ view: targetId }, "", `#${cleanName}`);
    }
}

window.addEventListener("popstate", (event) => {
    const viewId = event.state?.view || "home-view";
    switchView(viewId, true);
});

// Drawer Logic
function openDrawer() { elements.drawer.classList.add('open'); elements.drawerOverlay.classList.add('open'); }
function closeDrawer() { elements.drawer.classList.remove('open'); elements.drawerOverlay.classList.remove('open'); }
function openCartDrawer() { elements.cartDrawer.classList.add('open'); elements.cartDrawerOverlay.classList.add('open'); }
function closeCartDrawer() { elements.cartDrawer.classList.remove('open'); elements.cartDrawerOverlay.classList.remove('open'); }

/* =========================================
   AUTH LOGIC
   ========================================= */

// Setup Recaptcha
window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    'size': 'normal',
    'callback': (response) => { /* Resolved */ }
});

async function ensureUserProfile(user) {
    const userRef = db.ref(`users/${user.uid}`);
    const snapshot = await userRef.once('value');
    const currentData = snapshot.val() || {};
    
    await userRef.update({
        name: currentData.name || user.displayName || ('User ' + (user.phoneNumber ? user.phoneNumber.slice(-4) : '')),
        email: currentData.email || user.email || '',
        phone: currentData.phone || user.phoneNumber || '',
        lat: currentData.lat || appState.currentLocation.lat || null,
        lng: currentData.lng || appState.currentLocation.lng || null,
        address: currentData.address || ''
    });
}

auth.onAuthStateChanged(async user => {
    appState.currentUser = user;
    if (user) {
        elements.authBtn.style.display = 'none';
        elements.profileSection.style.display = 'block';
        elements.logoutDrawerBtn.style.display = 'flex';
        
        await ensureUserProfile(user);
        
        db.ref(`users/${user.uid}`).once('value', snapshot => {
            const profile = snapshot.val();
            if (profile) updateLocationDisplay(profile.lat, profile.lng);
        });
        renderCart();
    } else {
        elements.authBtn.style.display = 'flex';
        elements.profileSection.style.display = 'none';
        elements.logoutDrawerBtn.style.display = 'none';
        elements.locationDisplay.classList.remove('active');
    }
});

elements.authBtn.addEventListener('click', () => {
    elements.loginModal.classList.add('open');
    elements.phoneStep1.style.display = 'block';
    elements.phoneStep2.style.display = 'none';
    window.recaptchaVerifier.render();
});

elements.closeLoginModal.addEventListener('click', () => elements.loginModal.classList.remove('open'));

// Google Login
elements.googleLoginBtn.addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        showLoader();
        await auth.signInWithPopup(provider);
        elements.loginModal.classList.remove('open');
        showToast('Welcome to WimHub!');
    } catch (error) {
        showToast(error.message);
    } finally { hideLoader(); }
});

// Phone Login
elements.sendOtpBtn.addEventListener('click', async () => {
    let phoneNumber = elements.loginPhone.value.trim();
    if(!phoneNumber) return showToast("Enter a valid number");
    if(!phoneNumber.startsWith("+91")) phoneNumber = "+91" + phoneNumber;
    
    try {
        showLoader();
        appState.confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier);
        elements.phoneStep1.style.display = 'none';
        elements.phoneStep2.style.display = 'block';
        showToast("OTP Sent!");
    } catch (error) {
        showToast(error.message);
        window.recaptchaVerifier.render().then(wId => grecaptcha.reset(wId));
    } finally { hideLoader(); }
});

elements.verifyOtpBtn.addEventListener('click', async () => {
    const code = elements.loginOtp.value;
    if(!code) return showToast("Enter OTP");
    
    try {
        showLoader();
        await appState.confirmationResult.confirm(code);
        elements.loginModal.classList.remove('open');
        showToast("Phone Verified!");
    } catch (error) {
        showToast("Invalid OTP");
    } finally { hideLoader(); }
});

elements.backToPhoneBtn.addEventListener('click', () => {
    elements.phoneStep1.style.display = 'block';
    elements.phoneStep2.style.display = 'none';
});

async function handleLogout() {
    try {
        showLoader();
        await auth.signOut();
        showToast('Logged Out');
        switchView('home-view');
    } catch (e) { showToast(e.message); } 
    finally { hideLoader(); }
}
elements.profileLogoutBtn.addEventListener('click', handleLogout);
elements.logoutDrawerBtn.addEventListener('click', handleLogout);

/* =========================================
   CART LOGIC
   ========================================= */
function addToCart(product) {
    if (appState.cart[product.id]) {
        appState.cart[product.id].qty++;
    } else {
        appState.cart[product.id] = { ...product, qty: 1 };
    }
    localStorage.setItem('cart', JSON.stringify(appState.cart));
    renderCart();
    // Animation effect for cart button
    elements.cartBtn.classList.add('bump');
    setTimeout(() => elements.cartBtn.classList.remove('bump'), 300);
    showToast(`${product.name} added!`);
}

function renderCart() {
    let html = '';
    let subtotal = 0;
    let totalItems = 0;
    const cartItems = Object.values(appState.cart);

    if (cartItems.length === 0) {
        html = '<div style="text-align:center; padding:2rem; color:#999;"><i class="fas fa-shopping-basket" style="font-size:3rem; margin-bottom:1rem; opacity:0.3;"></i><p>Your cart is empty.</p></div>';
        elements.checkoutBtn.disabled = true;
        elements.checkoutBtn.style.opacity = '0.5';
        elements.cartCount.style.display = 'none';
    } else {
        elements.checkoutBtn.disabled = false;
        elements.checkoutBtn.style.opacity = '1';
        elements.cartCount.style.display = 'block';
        
        cartItems.forEach(item => {
            const itemTotal = (Number(item.price)||0) * item.qty;
            subtotal += itemTotal;
            totalItems += item.qty;
            html += `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-details" style="flex:1;">
                        <div class="cart-item-info">
                            <h4>${item.name}</h4>
                            <p>${item.unit} | ₹${item.price}</p>
                        </div>
                        <div class="cart-controls">
                            <button class="qty-btn" onclick="changeQty('${item.id}', -1)"><i class="fas fa-minus"></i></button>
                            <span style="font-weight:600; font-size:0.9rem;">${item.qty}</span>
                            <button class="qty-btn" onclick="changeQty('${item.id}', 1)"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                    <div style="font-weight:700; color:var(--primary);">₹${itemTotal.toFixed(2)}</div>
                </div>
            `;
        });
    }

    elements.cartItems.innerHTML = html;
    elements.cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
    elements.cartCount.textContent = totalItems;
    
    // Also render full checkout view if active
    renderCartViewHTML(cartItems, subtotal);
}

function changeQty(productId, change) {
    if (appState.cart[productId]) {
        appState.cart[productId].qty += change;
        if (appState.cart[productId].qty <= 0) delete appState.cart[productId];
        localStorage.setItem('cart', JSON.stringify(appState.cart));
        renderCart();
    }
}

function renderCartViewHTML(cartItems, subtotal) {
    // Renders the detailed view in "Checkout" section
    let html = '';
    if (cartItems.length === 0) {
        html = '<p style="text-align:center; color:#777;">Your cart is empty.</p>';
    } else {
        cartItems.forEach(item => {
             const itemTotal = (Number(item.price)||0) * item.qty;
             html += `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-img">
                    <div style="flex:1">
                        <h4>${item.name}</h4>
                        <p>${item.unit}</p>
                        <div style="margin-top:5px; color:var(--primary); font-weight:700;">₹${item.price} x ${item.qty}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;">₹${itemTotal.toFixed(2)}</div>
                        <button onclick="changeQty('${item.id}', 0); changeQty('${item.id}', -${item.qty})" style="background:none; border:none; color:red; margin-top:5px; cursor:pointer;">Remove</button>
                    </div>
                </div>
             `;
        });
    }
    if(elements.cartViewItems) elements.cartViewItems.innerHTML = html;
    if(elements.checkoutSubtotal) elements.checkoutSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
    const total = subtotal + (subtotal > 0 ? DELIVERY_CHARGE : 0);
    if(elements.checkoutTotal) elements.checkoutTotal.textContent = `₹${total.toFixed(2)}`;
}

// Checkout Button Actions
elements.checkoutBtn.addEventListener('click', () => {
    if (!appState.currentUser) {
        showToast('Please login to checkout.');
        elements.loginModal.classList.add('open');
        closeCartDrawer();
        return;
    }
    closeCartDrawer();
    switchView('cart-view');
    loadUserProfileForCheckout();
});

async function loadUserProfileForCheckout() {
    if (!appState.currentUser) return;
    const snapshot = await db.ref(`users/${appState.currentUser.uid}`).once('value');
    const profile = snapshot.val() || {};
    
    elements.checkoutName.value = profile.name || appState.currentUser.displayName || '';
    elements.checkoutPhone.value = profile.phone || appState.currentUser.phoneNumber || '';
    elements.checkoutEmail.value = profile.email || appState.currentUser.email || '';
    elements.checkoutAddress.value = profile.address || '';
    
    if(appState.currentUser.email) elements.checkoutEmail.readOnly = true;
    if(appState.currentUser.phoneNumber && !appState.currentUser.email) elements.checkoutPhone.readOnly = true;
}

// Address Detect
elements.detectAddressBtn.addEventListener('click', async () => {
    showLoader();
    try {
        const loc = await getCurrentLocation();
        if (loc.lat && loc.lng) {
            appState.currentLocation = loc;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`);
            const data = await res.json();
            if(data && data.display_name) {
                elements.checkoutAddress.value = data.display_name;
                showToast("Address Detected");
            }
        } else { showToast("Location denied or unavailable"); }
    } catch(e) { console.error(e); } 
    finally { hideLoader(); }
});

// Place Order
elements.checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = Object.values(appState.cart);
    if (items.length === 0) return showToast('Cart is empty');

    try {
        showLoader();
        const orderId = db.ref('orders').push().key;
        const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * item.qty, 0);
        
        // Generate QR
        const qrCodeDataURL = await new Promise(resolve => {
            const qr = new QRCode(document.createElement("div"), {
                text: orderId, width: 128, height: 128
            });
            setTimeout(() => {
                const img = qr._el.querySelector("img");
                resolve(img ? img.src : "");
            }, 500);
        });

        let lat = appState.currentLocation.lat;
        let lng = appState.currentLocation.lng;
        // Fallback GPS
        if (!lat) {
             const loc = await getCurrentLocation();
             lat = loc.lat; lng = loc.lng;
        }

        const orderData = {
            id: orderId, orderId: orderId, userId: appState.currentUser.uid,
            customerName: elements.checkoutName.value,
            phone: elements.checkoutPhone.value,
            email: elements.checkoutEmail.value,
            address: elements.checkoutAddress.value,
            lat, lng,
            items: items.map(item => ({
                productId: item.id, name: item.name, qty: item.qty,
                unit: item.unit, price: Number(item.price) || 0
            })),
            subtotal, deliveryCharge: DELIVERY_CHARGE, 
            total: subtotal + DELIVERY_CHARGE,
            status: 'ORDER PLACED', qrCode: qrCodeDataURL,
            otp: Math.floor(100000 + Math.random() * 900000),
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await db.ref(`orders/${orderId}`).set(orderData);
        
        // Update user address if changed
        await db.ref(`users/${appState.currentUser.uid}`).update({
            address: elements.checkoutAddress.value,
            phone: elements.checkoutPhone.value
        });

        // Update counts
        items.forEach(item => {
            db.ref(`popularProducts/${item.id}/buyCount`).transaction(count => (count || 0) + item.qty);
        });

        appState.cart = {};
        localStorage.removeItem('cart');
        renderCart();

        const overlay = document.getElementById('order-success-overlay');
        overlay.classList.add('active');
        setTimeout(() => {
            overlay.classList.remove('active');
            switchView('orders-view');
            loadOrders();
        }, 3000);

    } catch (error) {
        showToast('Order failed: ' + error.message);
    } finally { hideLoader(); }
});

/* =========================================
   PRODUCTS & HOME LOGIC
   ========================================= */

async function loadAds() {
    try {
        const snapshot = await db.ref('ads').once('value');
        appState.ads = Object.values(snapshot.val() || {});
        renderAds();
    } catch (e) { console.error(e); }
}

function renderAds() {
    const slider = elements.bannerSlider;
    const dotsContainer = document.getElementById('banner-dots');
    if (!slider || appState.ads.length === 0) return;
    
    slider.innerHTML = '';
    dotsContainer.innerHTML = '';
    
    appState.ads.forEach((ad, i) => {
        const slide = document.createElement('div');
        slide.className = 'banner-slide';
        slide.style.backgroundImage = `url('${ad.image}')`;
        slider.appendChild(slide);
        
        const dot = document.createElement('div');
        dot.className = i === 0 ? 'banner-dot active' : 'banner-dot';
        dot.onclick = () => {
             slider.style.transform = `translateX(-${i * 100}%)`;
             document.querySelectorAll('.banner-dot').forEach(d => d.classList.remove('active'));
             dot.classList.add('active');
        };
        dotsContainer.appendChild(dot);
    });
    
    // Simple Auto Slide
    let currentSlide = 0;
    setInterval(() => {
        currentSlide = (currentSlide + 1) % appState.ads.length;
        slider.style.transform = `translateX(-${currentSlide * 100}%)`;
        const dots = document.querySelectorAll('.banner-dot');
        dots.forEach(d => d.classList.remove('active'));
        if(dots[currentSlide]) dots[currentSlide].classList.add('active');
    }, 4000);
}

function renderCategories() {
    const container = elements.categoryList;
    if(!container) return;
    container.innerHTML = appState.categories.map(cat => `
        <div class="category-card" onclick="loadProducts('${cat.id}'); switchView('products-view');">
            <i class="${cat.icon}"></i>
            <h4>${cat.name}</h4>
        </div>
    `).join('');
}

async function loadProducts(category = null) {
    showLoader();
    elements.productsGrid.innerHTML = ''; // Clear main products view
    appState.currentCategory = category;
    
    const title = category ? appState.categories.find(c => c.id === category)?.name : 'All Products';
    if(elements.productsTitle) elements.productsTitle.textContent = title;

    try {
        const snapshot = await db.ref('products').once('value');
        const data = snapshot.val() || {};
        let allProducts = [];

        // Parsing logic based on structure
        const keys = Object.keys(data);
        if (keys.length > 0) {
            // Check if flattened or categorized
            if(data[keys[0]].name) {
                // Flattened
                allProducts = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
                if(category) allProducts = allProducts.filter(p => p.category === category);
            } else {
                // Nested by category
                if(category && data[category]) {
                     allProducts = Object.entries(data[category]).map(([k,v]) => ({id:k, ...v}));
                } else if (!category) {
                     Object.keys(data).forEach(cat => {
                         Object.entries(data[cat]).forEach(([k,v]) => allProducts.push({id:k, ...v, category: cat}));
                     });
                }
            }
        }
        
        appState.products = allProducts.map(p => ({ ...p, price: Number(p.price) || 0 }));
        renderAllProductGrids();
    } catch (e) { console.error(e); } 
    finally { hideLoader(); }
}

function renderAllProductGrids(query = '') {
    const filtered = appState.products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
    
    // Helper to generate card HTML
    const createCard = (p) => `
        <div class="product-card" onclick="addToCart({id:'${p.id}', name:'${p.name}', price:${p.price}, image:'${p.image}', unit:'${p.unit}'})">
            <div class="product-img-wrapper">
                <img src="${p.image}" alt="${p.name}">
            </div>
            <div class="product-details">
                <h4>${p.name}</h4>
                <p>${p.unit}</p>
                <div class="price-row">
                    <span class="price">₹${p.price.toFixed(2)}</span>
                    <button class="add-btn"><i class="fas fa-plus"></i></button>
                </div>
            </div>
        </div>
    `;

    // 1. Main View
    if(elements.productsGrid) {
        elements.productsGrid.innerHTML = filtered.length ? filtered.map(createCard).join('') : '<p>No products found.</p>';
    }
    
    // 2. Home - New Arrivals (Just shuffle/take first 8)
    if(elements.homeProductsGrid) {
        elements.homeProductsGrid.innerHTML = filtered.slice(0, 8).map(createCard).join('');
    }
    
    // 3. Home - Trending (Based on buy count - mock or real)
    if(elements.popularProductsGrid) {
        // We'll fetch buy counts if needed, for now just random sort or specific logic
        // Assuming buyCount is merged earlier or we sort by price for demo
        const popular = [...filtered].sort((a,b) => (b.buyCount || 0) - (a.buyCount || 0)).slice(0, 4);
        elements.popularProductsGrid.innerHTML = popular.map(createCard).join('');
    }
}

// Search
elements.searchBtn.addEventListener('click', () => {
    elements.headerSearchContainer.classList.toggle('active');
    if(elements.headerSearchContainer.classList.contains('active')) elements.searchInput.focus();
});

elements.searchInput.addEventListener('keyup', (e) => {
    const q = e.target.value;
    if(e.key === 'Enter') switchView('products-view');
    renderAllProductGrids(q);
});

/* =========================================
   ORDERS, PROFILE, MAP
   ========================================= */

function loadOrders() {
    if (!appState.currentUser) return;
    showLoader();
    db.ref('orders').orderByChild('userId').equalTo(appState.currentUser.uid).on('value', snap => {
        const orders = Object.values(snap.val() || {}).reverse();
        const html = orders.length ? orders.map(order => {
            let statusClass = 'status-pending';
            const s = (order.status||'').toLowerCase();
            if(s.includes('ship')) statusClass = 'status-shipping';
            if(s.includes('deliv')) statusClass = 'status-delivered';
            
            const date = new Date(order.createdAt).toLocaleDateString();
            const itemsList = (order.items||[]).map(i => `<div>${i.name} x ${i.qty}</div>`).join('');
            
            return `
                <div class="order-card">
                    <div class="order-header">
                        <span style="font-weight:700;">#${order.id.slice(-6)}</span>
                        <span class="status-badge ${statusClass}">${order.status}</span>
                    </div>
                    <div style="font-size:0.85rem; color:#777; margin-bottom:1rem;">${date}</div>
                    <div style="font-size:0.9rem; line-height:1.6;">${itemsList}</div>
                    ${order.otp ? `<div style="background:#f0f9ff; padding:5px; margin:10px 0; border:1px dashed #0ea5e9; text-align:center;">OTP: <strong>${order.otp}</strong></div>` : ''}
                    <div class="order-total-row">
                        <span>Total Amount</span>
                        <span>₹${order.total.toFixed(2)}</span>
                    </div>
                    <div style="text-align:center; margin-top:1rem;">
                        <img src="${order.qrCode}" style="width:80px;">
                    </div>
                </div>
            `;
        }).join('') : '<p style="text-align:center;">No orders yet.</p>';
        elements.ordersList.innerHTML = html;
        hideLoader();
    });
}

function loadProfile() {
    if (!appState.currentUser) return;
    showLoader();
    db.ref(`users/${appState.currentUser.uid}`).once('value', snap => {
        const p = snap.val() || {};
        elements.profileInfo.innerHTML = `
            <h3>${p.name || 'User'}</h3>
            <p style="color:#666;">${p.email || p.phone}</p>
        `;
        // Pre-fill edit form
        elements.updateName.value = p.name || '';
        elements.updateEmail.value = p.email || '';
        elements.updatePhone.value = p.phone || '';
        elements.updateAddress.value = p.address || '';
        
        elements.updateProfileForm.style.display = 'none';
        hideLoader();
    });
}

elements.editProfileBtn.addEventListener('click', () => {
    elements.updateProfileForm.style.display = elements.updateProfileForm.style.display === 'block' ? 'none' : 'block';
});

elements.updateProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        await db.ref(`users/${appState.currentUser.uid}`).update({
            name: elements.updateName.value,
            email: elements.updateEmail.value,
            phone: elements.updatePhone.value,
            address: elements.updateAddress.value
        });
        showToast("Profile Updated");
        loadProfile();
    } catch(e) { showToast("Error updating profile"); }
    finally { hideLoader(); }
});

// Map
let map, marker;
async function initMap() {
    const defLat = 20.5937, defLng = 78.9629;
    const lat = appState.currentLocation.lat || defLat;
    const lng = appState.currentLocation.lng || defLng;
    
    if(map) map.remove();
    map = L.map('map-container').setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on('dragend', (e) => {
        const { lat, lng } = marker.getLatLng();
        appState.currentLocation = { lat, lng };
    });
    
    if(!appState.currentLocation.lat) {
        const loc = await getCurrentLocation();
        if(loc.lat) {
            appState.currentLocation = loc;
            map.setView([loc.lat, loc.lng], 15);
            marker.setLatLng([loc.lat, loc.lng]);
        }
    }
}

elements.detectLocationBtn.addEventListener('click', async () => {
    showLoader();
    const loc = await getCurrentLocation();
    if(loc.lat) {
        appState.currentLocation = loc;
        map.setView([loc.lat, loc.lng], 16);
        marker.setLatLng([loc.lat, loc.lng]);
        showToast("Location Found");
    } else showToast("Could not find location");
    hideLoader();
});

elements.saveLocationBtn.addEventListener('click', async () => {
    if(!appState.currentUser) return showToast("Please login");
    if(!appState.currentLocation.lat) return showToast("No location selected");
    
    await db.ref(`users/${appState.currentUser.uid}`).update(appState.currentLocation);
    updateLocationDisplay(appState.currentLocation.lat, appState.currentLocation.lng);
    showToast("Location Saved");
    switchView('profile-view');
});

function updateLocationDisplay(lat, lng) {
    if(lat && lng) {
        elements.locationDisplay.classList.add('active');
        elements.currentLocationText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// Change Location triggers
elements.profileMapBtn.addEventListener('click', () => { switchView('map-view'); initMap(); });
elements.changeLocationBtn.addEventListener('click', () => { switchView('map-view'); initMap(); });

/* =========================================
   UI EVENTS
   ========================================= */
// Mobile Bottom Nav
elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if(view === 'cart') renderCartViewHTML(Object.values(appState.cart), 0); // Hack update
        if(view === 'orders' || view === 'profile') {
            if(!appState.currentUser) {
                elements.loginModal.classList.add('open');
                return;
            }
            if(view === 'orders') loadOrders();
            if(view === 'profile') loadProfile();
        }
        switchView(view);
    });
});

// Drawer
elements.hamburger.addEventListener('click', openDrawer);
elements.closeDrawerBtn.addEventListener('click', closeDrawer);
elements.drawerOverlay.addEventListener('click', closeDrawer);
elements.drawerItems.forEach(item => {
    item.addEventListener('click', () => {
        const view = item.dataset.view;
        if(view) {
            if((view === 'orders' || view === 'profile') && !appState.currentUser) {
                elements.loginModal.classList.add('open');
                return;
            }
            if(view === 'products') loadProducts();
            if(view === 'orders') loadOrders();
            if(view === 'profile') loadProfile();
            switchView(view);
        }
    });
});

// Cart Drawer
elements.cartBtn.addEventListener('click', openCartDrawer);
elements.closeCartBtn.addEventListener('click', closeCartDrawer);
elements.cartDrawerOverlay.addEventListener('click', closeCartDrawer);

// Queries
elements.queriesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        await db.ref('queries').push({
            name: document.getElementById('query-name').value,
            email: document.getElementById('query-email').value,
            message: document.getElementById('query-message').value,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        showToast("Query Submitted!");
        e.target.reset();
    } catch(e) { showToast("Error submitting query"); }
    finally { hideLoader(); }
});

// Init
window.addEventListener("DOMContentLoaded", () => {
    loadAds();
    renderCategories();
    loadProducts().then(() => renderAllProductGrids());
    getCurrentLocation().then(loc => {
        if(loc.lat) {
             appState.currentLocation = loc;
             updateLocationDisplay(loc.lat, loc.lng);
        }
    });
});