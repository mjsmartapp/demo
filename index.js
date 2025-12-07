document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
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
    
    // Constants
    const DELIVERY_CHARGE = 50;
    
    // --- State ---
    const appState = {
        currentUser: null,
        cart: JSON.parse(localStorage.getItem('cart')) || {},
        products: [],
        categories: [
            { id: 'groceries', name: 'Groceries', icon: 'fas fa-leaf' },
            { id: 'vegfruits', name: 'Fresh Veg', icon: 'fas fa-carrot' },
            { id: 'icejuice', name: 'Beverages', icon: 'fas fa-wine-glass-alt' },
            { id: 'snacksmed', name: 'Snacks', icon: 'fas fa-cookie-bite' },
            { id: 'hotel', name: 'Dining', icon: 'fas fa-utensils' },
            { id: 'meat', name: 'Meats', icon: 'fas fa-drumstick-bite' },
            { id: 'fishes', name: 'Seafood', icon: 'fas fa-fish' }               
        ],
        currentCategory: null,
        ads: [],
        currentLocation: { lat: null, lng: null },
        confirmationResult: null 
    };

    // --- DOM Elements ---
    const els = {
        loader: document.getElementById('loader-bar'),
        toastContainer: document.getElementById('toast-container'),
        
        // Navigation & Drawers
        hamburger: document.getElementById('hamburger'),
        drawer: document.getElementById('drawer'),
        drawerOverlay: document.getElementById('drawer-overlay'),
        closeDrawerBtn: document.getElementById('close-drawer-btn'),
        drawerItems: document.querySelectorAll('.drawer li, .nav-item, .footer-btn'), // Combined navs
        
        // Cart UI
        cartBtn: document.getElementById('cart-btn'),
        cartCount: document.getElementById('cart-count'),
        cartDrawer: document.getElementById('cart-drawer'),
        cartOverlay: document.getElementById('cart-overlay'),
        closeCartBtn: document.getElementById('close-cart-btn'),
        cartItemsContainer: document.getElementById('cart-items'),
        cartSubtotal: document.getElementById('cart-subtotal'),
        checkoutBtn: document.getElementById('checkout-btn'),
        
        // Auth UI
        authBtn: document.getElementById('auth-btn'),
        loginModal: document.getElementById('login-modal'),
        closeLoginModal: document.getElementById('close-login-modal'),
        googleLoginBtn: document.getElementById('google-login-btn'),
        loginPhone: document.getElementById('loginPhone'),
        sendOtpBtn: document.getElementById('send-otp-btn'),
        verifyOtpBtn: document.getElementById('verify-otp-btn'),
        loginOtp: document.getElementById('loginOtp'),
        phoneStep1: document.getElementById('phone-step-1'),
        phoneStep2: document.getElementById('phone-step-2'),
        backToPhoneBtn: document.getElementById('back-to-phone-btn'),
        profileSection: document.getElementById('profile-section'),
        logoutDrawerBtn: document.getElementById('logout-drawer-btn'),
        
        // Views
        viewSections: document.querySelectorAll('.view-section'),
        
        // Dynamic Content Areas
        bannerSlider: document.getElementById('banner-slider'),
        bannerDots: document.getElementById('banner-dots'),
        categoryList: document.getElementById('category-list'),
        popularGrid: document.getElementById('popular-products-grid'),
        homeGrid: document.getElementById('home-products-grid'),
        productsGrid: document.getElementById('products-grid'),
        productsTitle: document.getElementById('products-title'),
        ordersList: document.getElementById('orders-list'),
        
        // Search
        searchWrapper: document.getElementById('header-search-container'),
        searchBtn: document.getElementById('search-btn'),
        searchInput: document.getElementById('searchInput'),
        
        // Checkout & Profile Forms
        checkoutForm: document.getElementById('checkout-form'),
        checkoutName: document.getElementById('checkout-name'),
        checkoutPhone: document.getElementById('checkout-phone'),
        checkoutEmail: document.getElementById('checkout-email'),
        checkoutAddress: document.getElementById('checkout-address'),
        checkoutSubtotal: document.getElementById('checkout-subtotal'),
        checkoutTotal: document.getElementById('checkout-total'),
        detectAddressBtn: document.getElementById('detect-address-btn'),
        
        profileInfo: document.getElementById('profile-info'),
        editProfileBtn: document.getElementById('edit-profile-btn'),
        updateProfileForm: document.getElementById('update-profile-form'),
        updateName: document.getElementById('update-name'),
        updateEmail: document.getElementById('update-email'),
        updatePhone: document.getElementById('update-phone'),
        updateAddress: document.getElementById('update-address'),
        profileLogoutBtn: document.getElementById('profile-logout-btn'),
        
        // Location
        locationDisplay: document.getElementById('location-display'),
        locationText: document.getElementById('current-location-text'),
        changeLocBtn: document.getElementById('change-location-btn'),
        mapContainer: document.getElementById('map-container'),
        saveLocationBtn: document.getElementById('save-location-btn'),
        detectLocationBtn: document.getElementById('detect-location-btn'),
        profileMapBtn: document.getElementById('profile-map-btn'),
        
        // Misc
        queriesForm: document.getElementById('queries-form')
    };

    // --- Helper Functions ---
    const showLoader = () => els.loader.classList.add('active');
    const hideLoader = () => els.loader.classList.remove('active');
    
    const showToast = (msg) => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        els.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const getCurrentLocation = (timeout = 5000) => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) return resolve({ lat: null, lng: null });
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve({ lat: null, lng: null }),
                { timeout }
            );
        });
    };

    // --- Navigation Logic ---
    const switchView = (viewName) => {
        els.viewSections.forEach(sec => sec.classList.remove('active'));
        const target = document.getElementById(`${viewName}-view`);
        if (target) {
            target.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Update Active State in Navs
            els.drawerItems.forEach(item => {
                if(item.dataset.view === viewName) item.classList.add('active');
                else item.classList.remove('active');
            });
        }
        closeDrawer();
        closeCart();
    };

    const openDrawer = () => { els.drawer.classList.add('active'); els.drawerOverlay.classList.add('active'); };
    const closeDrawer = () => { els.drawer.classList.remove('active'); els.drawerOverlay.classList.remove('active'); };
    
    const openCart = () => { els.cartDrawer.classList.add('active'); els.cartOverlay.classList.add('active'); renderCart(); };
    const closeCart = () => { els.cartDrawer.classList.remove('active'); els.cartOverlay.classList.remove('active'); };

    // Listeners
    els.hamburger.addEventListener('click', openDrawer);
    els.closeDrawerBtn.addEventListener('click', closeDrawer);
    els.drawerOverlay.addEventListener('click', closeDrawer);
    
    els.cartBtn.addEventListener('click', openCart);
    els.closeCartBtn.addEventListener('click', closeCart);
    els.cartOverlay.addEventListener('click', closeCart);

    els.drawerItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Handle bubbled clicks
            const view = btn.dataset.view || e.currentTarget.dataset.view;
            if(!view) return;
            
            if (['orders', 'profile'].includes(view) && !appState.currentUser) {
                showToast("Please login to access this section");
                openLoginModal();
                return;
            }
            
            if (view === 'products') loadProducts();
            if (view === 'orders') loadOrders();
            if (view === 'profile') loadProfile();
            if (view === 'cart') { 
                renderCart(); // Update logic before switching
                // Actually switch to cart VIEW not just drawer for "My Cart" nav item
                renderCheckoutView();
            } 
            
            switchView(view);
        });
    });

    // --- Auth Logic ---
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'normal' });

    const openLoginModal = () => {
        els.loginModal.classList.add('open');
        els.phoneStep1.style.display = 'block';
        els.phoneStep2.style.display = 'none';
        window.recaptchaVerifier.render();
    };

    els.authBtn.addEventListener('click', openLoginModal);
    els.closeLoginModal.addEventListener('click', () => els.loginModal.classList.remove('open'));

    auth.onAuthStateChanged(async (user) => {
        appState.currentUser = user;
        if (user) {
            els.authBtn.style.display = 'none';
            els.profileSection.style.display = 'flex';
            els.logoutDrawerBtn.style.display = 'flex';
            
            // Sync/Create User Profile
            const userRef = db.ref(`users/${user.uid}`);
            const snap = await userRef.once('value');
            if (!snap.exists()) {
                await userRef.set({
                    name: user.displayName || 'User',
                    email: user.email || '',
                    phone: user.phoneNumber || '',
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                });
            } else {
                const data = snap.val();
                if(data.lat && data.lng) {
                    appState.currentLocation = { lat: data.lat, lng: data.lng };
                    updateLocationUI();
                }
            }
            renderCart(); // Re-render to check if cart needs specific user logic
        } else {
            els.authBtn.style.display = 'block';
            els.profileSection.style.display = 'none';
            els.logoutDrawerBtn.style.display = 'none';
            els.locationDisplay.classList.remove('active');
        }
    });

    els.googleLoginBtn.addEventListener('click', async () => {
        try {
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
            els.loginModal.classList.remove('open');
            showToast("Welcome!");
        } catch (e) { showToast(e.message); }
    });

    els.sendOtpBtn.addEventListener('click', async () => {
        let phone = els.loginPhone.value.trim();
        if (!phone) return showToast("Enter phone number");
        if (!phone.startsWith("+91")) phone = "+91" + phone;
        
        try {
            showLoader();
            appState.confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
            els.phoneStep1.style.display = 'none';
            els.phoneStep2.style.display = 'block';
            showToast("OTP Sent!");
        } catch (e) { 
            showToast(e.message); 
            console.error(e);
            window.recaptchaVerifier.render().then(w => grecaptcha.reset(w));
        } finally { hideLoader(); }
    });

    els.verifyOtpBtn.addEventListener('click', async () => {
        const code = els.loginOtp.value;
        if (!code) return showToast("Enter OTP");
        try {
            showLoader();
            await appState.confirmationResult.confirm(code);
            els.loginModal.classList.remove('open');
            showToast("Verified!");
        } catch (e) { showToast("Invalid OTP"); } finally { hideLoader(); }
    });

    els.backToPhoneBtn.addEventListener('click', () => {
        els.phoneStep1.style.display = 'block';
        els.phoneStep2.style.display = 'none';
    });

    const handleLogout = async () => {
        await auth.signOut();
        showToast("Logged Out");
        switchView('home');
    };
    els.profileLogoutBtn.addEventListener('click', handleLogout);
    els.logoutDrawerBtn.addEventListener('click', handleLogout);


    // --- Product Logic ---
    const createProductCard = (product, isCompact = false) => {
        const div = document.createElement('div');
        div.className = 'product-card';
        
        const cartItem = appState.cart[product.id];
        
        // Button Logic
        let actionBtn;
        if (cartItem) {
            actionBtn = `
                <div class="qty-control">
                    <button class="minus" data-id="${product.id}"><i class="fas fa-minus"></i></button>
                    <span>${cartItem.qty}</span>
                    <button class="plus" data-id="${product.id}"><i class="fas fa-plus"></i></button>
                </div>`;
        } else {
            actionBtn = `<button class="add-btn" data-id="${product.id}"><i class="fas fa-plus"></i></button>`;
        }

        div.innerHTML = `
            <div class="product-img-wrapper">
                <img src="${product.image}" loading="lazy" alt="${product.name}">
            </div>
            <div class="product-details">
                <div class="product-name">${product.name}</div>
                <div class="product-unit">${product.unit}</div>
                <div class="product-footer">
                    <span class="product-price">₹${Number(product.price).toFixed(2)}</span>
                    ${actionBtn}
                </div>
            </div>
        `;
        
        // Event Listeners for Buttons inside card
        const plusBtn = div.querySelector('.plus');
        const minusBtn = div.querySelector('.minus');
        const addBtn = div.querySelector('.add-btn');

        if(addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToCart(product);
            });
        }
        if(plusBtn) {
            plusBtn.addEventListener('click', (e) => { e.stopPropagation(); updateQty(product.id, 1); });
            minusBtn.addEventListener('click', (e) => { e.stopPropagation(); updateQty(product.id, -1); });
        }

        return div;
    };

    async function loadProducts(category = null) {
        showLoader();
        appState.currentCategory = category;
        if(category) {
            const catName = appState.categories.find(c => c.id === category)?.name || 'Products';
            els.productsTitle.textContent = catName;
        } else {
            els.productsTitle.textContent = "All Products";
        }

        try {
            const snap = await db.ref('products').once('value');
            const data = snap.val() || {};
            let list = [];
            
            // Normalize Data
            const processData = (obj, catPrefix) => {
                Object.entries(obj).forEach(([key, val]) => {
                    if (val.name) {
                        // It's a product
                        if (!category || val.category === category || catPrefix === category) {
                            list.push({ id: key, ...val, category: val.category || catPrefix });
                        }
                    } else if (typeof val === 'object') {
                        // Nested
                        processData(val, key);
                    }
                });
            };
            processData(data, null);
            
            appState.products = list;
            renderAllGrids();
        } catch (e) { console.error(e); } finally { hideLoader(); }
    }

    const renderAllGrids = () => {
        els.productsGrid.innerHTML = '';
        els.popularGrid.innerHTML = '';
        els.homeGrid.innerHTML = '';
        
        const term = els.searchInput.value.toLowerCase();
        
        appState.products.forEach(p => {
            if (p.name.toLowerCase().includes(term)) {
                // Main Products Grid
                els.productsGrid.appendChild(createProductCard(p));
                // Home Grid
                els.homeGrid.appendChild(createProductCard(p));
            }
        });

        // Popular (Mock logic based on buyCount)
        const popular = [...appState.products].sort((a,b) => (b.buyCount||0) - (a.buyCount||0)).slice(0, 6);
        popular.forEach(p => els.popularGrid.appendChild(createProductCard(p)));
    };

    // --- Cart Logic ---
    const addToCart = (product) => {
        if (!appState.cart[product.id]) {
            appState.cart[product.id] = { ...product, qty: 1 };
        } else {
            appState.cart[product.id].qty++;
        }
        saveCart();
        showToast("Added to bag");
    };

    const updateQty = (id, delta) => {
        if(appState.cart[id]) {
            appState.cart[id].qty += delta;
            if(appState.cart[id].qty <= 0) delete appState.cart[id];
            saveCart();
        }
    };

    const saveCart = () => {
        localStorage.setItem('cart', JSON.stringify(appState.cart));
        renderCart();
        renderAllGrids(); // Refresh buttons
    };

    const renderCart = () => {
        const items = Object.values(appState.cart);
        let total = 0;
        let count = 0;
        
        els.cartItemsContainer.innerHTML = '';
        
        if (items.length === 0) {
            els.cartItemsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Your bag is empty.</div>';
            els.cartCount.style.display = 'none';
            els.checkoutBtn.disabled = true;
        } else {
            items.forEach(item => {
                const itemTotal = (Number(item.price) || 0) * item.qty;
                total += itemTotal;
                count += item.qty;
                
                const div = document.createElement('div');
                div.className = 'cart-row';
                div.innerHTML = `
                    <img src="${item.image}" alt="img">
                    <div class="cart-row-info">
                        <h4>${item.name}</h4>
                        <p>₹${item.price}</p>
                    </div>
                    <div class="qty-control">
                        <button class="minus"><i class="fas fa-minus"></i></button>
                        <span>${item.qty}</span>
                        <button class="plus"><i class="fas fa-plus"></i></button>
                    </div>
                `;
                
                div.querySelector('.minus').addEventListener('click', () => updateQty(item.id, -1));
                div.querySelector('.plus').addEventListener('click', () => updateQty(item.id, 1));
                els.cartItemsContainer.appendChild(div);
            });
            els.cartCount.style.display = 'block';
            els.cartCount.textContent = count;
            els.checkoutBtn.disabled = false;
        }
        
        els.cartSubtotal.textContent = `₹${total.toFixed(2)}`;
    };

    els.checkoutBtn.addEventListener('click', () => {
        if (!appState.currentUser) {
            closeCart();
            showToast("Please login to checkout");
            openLoginModal();
        } else {
            renderCheckoutView();
            switchView('cart'); // Go to full view
        }
    });

    const renderCheckoutView = () => {
        const items = Object.values(appState.cart);
        const container = document.getElementById('cart-view-items');
        container.innerHTML = '';
        let subtotal = 0;
        
        if(items.length === 0) {
            container.innerHTML = "Cart is empty.";
            return;
        }

        items.forEach(item => {
            const t = item.price * item.qty;
            subtotal += t;
            container.innerHTML += `
                <div class="cart-row">
                    <img src="${item.image}" style="width:50px; height:50px; border-radius:5px;">
                    <div class="cart-row-info">
                        <strong>${item.name}</strong> x ${item.qty}
                    </div>
                    <div style="font-weight:bold;">₹${t.toFixed(2)}</div>
                </div>
            `;
        });

        els.checkoutSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
        els.checkoutTotal.textContent = `₹${(subtotal + DELIVERY_CHARGE).toFixed(2)}`;
        
        // Autofill form
        if(appState.currentUser) {
            db.ref(`users/${appState.currentUser.uid}`).once('value', s => {
                const u = s.val() || {};
                els.checkoutName.value = u.name || '';
                els.checkoutPhone.value = u.phone || '';
                els.checkoutEmail.value = u.email || '';
                els.checkoutAddress.value = u.address || '';
            });
        }
    };

    // --- Order Logic ---
    els.checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        try {
            const orderId = db.ref('orders').push().key;
            const subtotal = Object.values(appState.cart).reduce((sum, i) => sum + (i.price*i.qty), 0);
            
            // Generate QR
            const qrCodeDataURL = await new Promise(resolve => {
                const qr = new QRCode(document.createElement("div"), {
                    text: orderId, width: 128, height: 128
                });
                setTimeout(() => {
                    const canvas = qr._el.querySelector("canvas");
                    resolve(canvas ? canvas.toDataURL() : "");
                }, 300);
            });

            const order = {
                id: orderId,
                userId: appState.currentUser.uid,
                customer: {
                    name: els.checkoutName.value,
                    phone: els.checkoutPhone.value,
                    email: els.checkoutEmail.value,
                    address: els.checkoutAddress.value
                },
                items: appState.cart,
                total: subtotal + DELIVERY_CHARGE,
                status: 'PENDING',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                qrCode: qrCodeDataURL,
                otp: Math.floor(1000 + Math.random() * 9000)
            };

            await db.ref(`orders/${orderId}`).set(order);
            
            // Update User Profile with latest address
            await db.ref(`users/${appState.currentUser.uid}`).update({
                address: els.checkoutAddress.value,
                phone: els.checkoutPhone.value
            });

            appState.cart = {};
            saveCart();
            
            const overlay = document.getElementById('order-success-overlay');
            overlay.classList.add('active');
            setTimeout(() => {
                overlay.classList.remove('active');
                switchView('orders');
                loadOrders();
            }, 2500);

        } catch (err) { showToast("Order Failed"); console.error(err); } 
        finally { hideLoader(); }
    });

    const loadOrders = () => {
        if(!appState.currentUser) return;
        showLoader();
        els.ordersList.innerHTML = '';
        db.ref('orders').orderByChild('userId').equalTo(appState.currentUser.uid)
            .once('value', snap => {
                const orders = snap.val() ? Object.values(snap.val()).reverse() : [];
                if(orders.length === 0) {
                    els.ordersList.innerHTML = '<div style="text-align:center; padding:1rem;">No orders found.</div>';
                } else {
                    orders.forEach(o => {
                        const date = new Date(o.createdAt).toLocaleDateString();
                        const card = document.createElement('div');
                        card.className = 'order-card';
                        
                        let statusClass = 'status-pending';
                        if(o.status === 'DELIVERED') statusClass = 'status-delivered';
                        else if(o.status === 'SHIPPING') statusClass = 'status-shipping';

                        let itemsStr = Object.values(o.items || {}).map(i => `${i.name} x${i.qty}`).join(', ');

                        card.innerHTML = `
                            <div class="order-top">
                                <strong>#${o.id.substring(0,8)}</strong>
                                <span class="status-badge ${statusClass}">${o.status}</span>
                            </div>
                            <div style="font-size:0.9rem; margin-bottom:0.5rem; color:#555;">${itemsStr}</div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-size:0.8rem; color:#888;">${date}</div>
                                <div style="font-weight:bold;">₹${Number(o.total).toFixed(2)}</div>
                            </div>
                            ${o.status === 'SHIPPING' ? `<div style="margin-top:10px; background:#e0f2fe; padding:5px 10px; border-radius:5px; font-size:0.9rem; text-align:center;">OTP: <strong>${o.otp}</strong></div>` : ''}
                        `;
                        els.ordersList.appendChild(card);
                    });
                }
                hideLoader();
            });
    };

    // --- Profile & Location ---
    const loadProfile = async () => {
        showLoader();
        const snap = await db.ref(`users/${appState.currentUser.uid}`).once('value');
        const data = snap.val() || {};
        
        els.profileInfo.innerHTML = `
            <h3>${data.name || 'User'}</h3>
            <p style="color:#666;">${data.email || data.phone}</p>
            <div style="margin-top:1rem; padding:1rem; background:#f9fafb; border-radius:8px;">
                <small style="color:#888;">Default Address</small>
                <p>${data.address || 'Not set'}</p>
            </div>
        `;
        
        // Fill Edit Form
        els.updateName.value = data.name || '';
        els.updateEmail.value = data.email || '';
        els.updatePhone.value = data.phone || '';
        els.updateAddress.value = data.address || '';
        
        hideLoader();
    };

    els.editProfileBtn.addEventListener('click', () => {
        els.updateProfileForm.style.display = els.updateProfileForm.style.display === 'none' ? 'block' : 'none';
    });

    els.updateProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        await db.ref(`users/${appState.currentUser.uid}`).update({
            name: els.updateName.value,
            email: els.updateEmail.value,
            phone: els.updatePhone.value,
            address: els.updateAddress.value
        });
        showToast("Profile Updated");
        loadProfile();
        hideLoader();
    });

    // --- Map Logic ---
    let map, marker;
    const initMap = async () => {
        const defLat = 20.5937, defLng = 78.9629;
        const lat = appState.currentLocation.lat || defLat;
        const lng = appState.currentLocation.lng || defLng;
        
        if (map) map.remove();
        map = L.map('map-container').setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', function(e) {
            const pos = marker.getLatLng();
            appState.currentLocation = { lat: pos.lat, lng: pos.lng };
        });
    };

    els.profileMapBtn.addEventListener('click', () => { switchView('map'); initMap(); });
    els.changeLocBtn.addEventListener('click', () => {
        if(!appState.currentUser) return openLoginModal();
        switchView('map'); 
        initMap(); 
    });

    els.detectLocationBtn.addEventListener('click', async () => {
        showLoader();
        const loc = await getCurrentLocation();
        if(loc.lat) {
            appState.currentLocation = loc;
            if(map) {
                map.setView([loc.lat, loc.lng], 16);
                marker.setLatLng([loc.lat, loc.lng]);
            }
        } else showToast("Permission denied");
        hideLoader();
    });

    els.saveLocationBtn.addEventListener('click', async () => {
        if(!appState.currentUser || !appState.currentLocation.lat) return;
        await db.ref(`users/${appState.currentUser.uid}`).update(appState.currentLocation);
        updateLocationUI();
        showToast("Location Saved");
        switchView('home');
    });

    const updateLocationUI = () => {
        if(appState.currentLocation.lat) {
            els.locationDisplay.classList.add('active');
            els.locationText.textContent = `${appState.currentLocation.lat.toFixed(4)}, ${appState.currentLocation.lng.toFixed(4)}`;
        }
    };

    els.detectAddressBtn.addEventListener('click', async () => {
        showLoader();
        const loc = await getCurrentLocation();
        if(loc.lat) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`);
                const data = await res.json();
                if(data.display_name) els.checkoutAddress.value = data.display_name;
            } catch(e) { showToast("Address fetch failed"); }
        }
        hideLoader();
    });

    // --- Search ---
    els.searchBtn.addEventListener('click', () => {
        els.searchWrapper.style.display = els.searchWrapper.style.display === 'block' ? 'none' : 'block';
    });
    
    els.searchInput.addEventListener('input', () => {
        renderAllGrids();
        if(els.searchInput.value.length > 0) switchView('home');
    });

    // --- Ads / Banner ---
    const loadAds = async () => {
        const snap = await db.ref('ads').once('value');
        const ads = Object.values(snap.val() || {});
        els.bannerSlider.innerHTML = '';
        els.bannerDots.innerHTML = '';
        
        ads.forEach((ad, i) => {
            const div = document.createElement('div');
            div.className = 'banner-slide';
            div.style.backgroundImage = `url('${ad.image}')`;
            els.bannerSlider.appendChild(div);
            
            const dot = document.createElement('div');
            dot.className = i === 0 ? 'banner-dot active' : 'banner-dot';
            els.bannerDots.appendChild(dot);
        });
    };

    // --- Categories ---
    const renderCategories = () => {
        els.categoryList.innerHTML = appState.categories.map(c => `
            <div class="category-card" data-id="${c.id}">
                <div class="cat-icon-box"><i class="${c.icon}"></i></div>
                <h4>${c.name}</h4>
            </div>
        `).join('');
        
        document.querySelectorAll('.category-card').forEach(c => {
            c.addEventListener('click', () => {
                loadProducts(c.dataset.id);
                switchView('products');
            });
        });
    };

    // --- Init ---
    (async function init() {
        loadAds();
        renderCategories();
        await loadProducts();
        
        // Auto loc
        const loc = await getCurrentLocation();
        if(loc.lat) {
            appState.currentLocation = loc;
            updateLocationUI();
        }
    })();
});
