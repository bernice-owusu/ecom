import React, { useState, useEffect } from 'react';
import './index.css';

// Config API domain (adjust if server is running elsewhere)
const API_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : '/api'
);


function App() {
  const [currentPage, setCurrentPage] = useState('store'); // store, checkout, success, audiobook, admin
  const [products, setProducts] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('Hard Copy'); // 'Hard Copy' or 'Audiobook'
  const [cart, setCart] = useState(null);

  // Checkout Info States
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');

  // Shipping details (Ghana flat-rate example default)
  const [country, setCountry] = useState('Ghana');
  const [region, setRegion] = useState('Greater Accra');
  const [city, setCity] = useState('Accra');
  const [address, setAddress] = useState('');
  const [additionalAddress, setAdditionalAddress] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Payment gateways simulation states
  const [paymentStatus, setPaymentStatus] = useState('idle'); // idle, processing, success, failed
  const [paymentMethod, setPaymentMethod] = useState('Mobile Money'); // 'Mobile Money', 'Card'
  const [createdOrder, setCreatedOrder] = useState(null);
  const [downloadToken, setDownloadToken] = useState(null);

  // Admin stats
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [adminStatusFilter, setAdminStatusFilter] = useState('All');
  const [adminSearch, setAdminSearch] = useState('');

  // Fetch Products
  useEffect(() => {
    fetch(`${API_URL}/products`)
      .then(r => r.json())
      .then(data => {
        setProducts(data);
        // Pre-fill cart with selected product format
        const defaultProd = data.find(p => p.format === selectedFormat);
        if (defaultProd) {
          setCart({ ...defaultProd, quantity: 1 });
        }
      })
      .catch(err => console.error('Error fetching products:', err));
  }, [selectedFormat, currentPage]);

  // Sync format selection to cart
  const handleFormatChange = (format) => {
    setSelectedFormat(format);
    const prod = products.find(p => p.format === format);
    if (prod) {
      setCart({ ...prod, quantity: 1 });
    }
  };

  // Run Order Creation
  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    if (!custName || !custEmail || !custPhone) {
      alert('Please fill out all customer details.');
      return;
    }

    if (selectedFormat === 'Hard Copy' && !address) {
      alert('Please provide a physical shipping address for book delivery.');
      return;
    }

    const payload = {
      customer: {
        name: custName,
        email: custEmail,
        phone: custPhone
      },
      items: [
        {
          id: cart.id,
          quantity: 1
        }
      ],
      shippingAddress: selectedFormat === 'Hard Copy' ? {
        country,
        region,
        city,
        address,
        additionalInfo: additionalAddress,
        postalCode: zipCode
      } : null
    };

    fetch(`${API_URL}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error('Checkout failed');
        return res.json();
      })
      .then(data => {
        setCreatedOrder(data);
        payWithPaystack(data);
      })
      .catch(err => {
        alert(err.message || 'Error occurred during checkout.');
      });
  };

  // Paystack Integration handler
  const payWithPaystack = (orderData) => {
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    const isMock = !publicKey || publicKey.includes('your_paystack_public_key');

    if (isMock) {
      setPaymentStatus('processing');
      setTimeout(() => {
        verifyPaymentOnBackend('MOCK-REF-' + Math.floor(Math.random() * 1000000), orderData.orderId);
      }, 2000);
      return;
    }

    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: custEmail,
      amount: Math.round(orderData.total * 100),
      currency: 'GHS',
      ref: orderData.orderId,
      callback: function (response) {
        setPaymentStatus('processing');
        verifyPaymentOnBackend(response.reference, orderData.orderId);
      },
      onClose: function () {
        alert('Transaction was not completed. You closed the payment window.');
        setPaymentStatus('idle');
      }
    });
    handler.openIframe();
  };

  // Backend verification handler
  const verifyPaymentOnBackend = (reference, orderId) => {
    fetch(`${API_URL}/payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        orderId
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Payment verification failed');
        return res.json();
      })
      .then(data => {
        if (data.status === 'Successful') {
          setPaymentStatus('success');
          setDownloadToken(data.downloadToken);
          setCurrentPage('success');
        } else {
          setPaymentStatus('failed');
        }
      })
      .catch((err) => {
        console.error(err);
        setPaymentStatus('failed');
        alert(err.message || 'Verification failed');
      });
  };

  // Load Admin metrics
  const fetchAdminMetrics = () => {
    fetch(`${API_URL}/admin/metrics`)
      .then(r => r.json())
      .then(data => setAdminMetrics(data))
      .catch(err => console.error(err));
  };

  const handleUpdateOrderStatus = (orderId, newStatus) => {
    fetch(`${API_URL}/admin/orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    })
      .then(res => res.json())
      .then(() => {
        fetchAdminMetrics();
      })
      .catch(err => console.error(err));
  };

  const resetFormState = () => {
    setCustName('');
    setCustEmail('');
    setCustPhone('');
    setAddress('');
    setAdditionalAddress('');
    setZipCode('');
    setPaymentStatus('idle');
    setCreatedOrder(null);
    setDownloadToken(null);
  };

  return (
    <div className="app-container">

      {/* Main App Page Handler */}
      <main>
        {/* SCREEN 1: Store / Product Page */}
        {currentPage === 'store' && (
          <div className="store-grid" >
            <div className="store-cover" style={{ textAlign: 'center', padding: '20px' }}>
              <img
                src="/img/resilience_cover.png"
                alt="Resilience Book Cover"
                className="hover-lift"
                style={{
                  maxWidth: '100%',
                  maxHeight: '480px',
                  width: 'auto',
                  boxShadow: '0 15px 35px rgba(0,0,0,0.15)',
                  border: '1px solid #ddd'
                }}
              />
            </div>
            <div className="store-info" style={{ textAlign: 'left', padding: '20px' }}>
              <h1>RESILIENCE</h1>
              <h2>By Thomas Akwasi Baafi</h2>
              <p style={{ fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--color-accent)' }}>
                A Journey of Grit, Growth, and Innovation
              </p>
              <p style={{ fontSize: '17px' }}>
                Resilience is the gripping autobiography of Thomas Akwasi Baafi. It charts his remarkable path from a small, remote village in Ghana, through the challenges of growing up in slums, to scaling the heights of the enterprise software ecosystem in West Africa as the founder and CEO of Bsystems.
              </p>

              <div style={{ margin: '24px 0', borderTop: '1px solid #eee', paddingTop: '18px' }}>
                <h3 style={{ marginBottom: '15px' }}>Choose Format</h3>
                <div className="format-selector-group">
                  <button
                    type="button"
                    className={`format-card ${selectedFormat === 'Hard Copy' ? 'active' : ''}`}
                    onClick={() => handleFormatChange('Hard Copy')}
                  >
                    <span className="format-check">✓</span>
                    Hard Copy
                    <span className="format-price">Physical delivery • GHS 0.30</span>
                  </button>
                  <button
                    type="button"
                    className={`format-card ${selectedFormat === 'Audiobook' ? 'active' : ''}`}
                    onClick={() => handleFormatChange('Audiobook')}
                  >
                    <span className="format-check">✓</span>
                    Audiobook
                    <span className="format-price">Instant download • GHS 0.20</span>
                  </button>
                  <button
                    type="button"
                    className={`format-card ${selectedFormat === 'Soft Copy' ? 'active' : ''}`}
                    onClick={() => handleFormatChange('Soft Copy')}
                  >
                    <span className="format-check">✓</span>
                    Soft Copy
                    <span className="format-price">eBook PDF • GHS 0.15</span>
                  </button>
                </div>
              </div>

              <div style={{ background: '#fcfcfc', padding: '20px', border: '1px solid #eee', marginBottom: '30px' }}>
                {selectedFormat === 'Hard Copy' && (
                  <>
                    <h3>Hard Copy Edition</h3>
                    <p style={{ margin: 0, fontSize: '16px' }}>
                      Premium printed version of Resilience. Dispatched to addresses across Ghana (Accra flat rate GHS {(cart?.deliveryFee || 0.10).toFixed(2)}). Expect delivery in 2-3 business days.
                    </p>
                  </>
                )}
                {selectedFormat === 'Audiobook' && (
                  <>
                    <h3>Digital Audiobook Edition</h3>
                    <p style={{ margin: 0, fontSize: '16px' }}>
                      Digital MP3 download package. Playable on any device. Link is generated instantly on payment confirmation.
                    </p>
                  </>
                )}
                {selectedFormat === 'Soft Copy' && (
                  <>
                    <h3>Digital eBook Edition</h3>
                    <p style={{ margin: 0, fontSize: '16px' }}>
                      Digital PDF & ePub eBook package. Readable on Kindle, tablets, phones, and computers. Link is generated instantly on payment confirmation.
                    </p>
                  </>
                )}
              </div>

              <button
                className="btn"
                style={{ width: '100%', padding: '15px 0', fontSize: '14px' }}
                onClick={() => setCurrentPage('checkout')}
              >
                Purchase Format Now
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 2: Checkout Form & Payment gate simulation */}
        {currentPage === 'checkout' && (
          <div style={{ textAlign: 'left', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '2rem' }}>Checkout</h1>
            <h2 style={{ marginBottom: '40px' }}>Secure Booking Portal</h2>

            {paymentStatus === 'processing' ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid #eee', background: '#fafafa' }}>
                <span className="ion-load-c" style={{ fontSize: '48px', display: 'block', animation: 'spin 1.5s infinite linear', marginBottom: '20px' }}></span>
                <h3>Verifying Transaction</h3>
                <p>Confirming transaction status with Paystack... Please do not refresh the page.</p>
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit}>
                <div className="grid grid-2" style={{ gap: '40px' }}>
                  {/* Left Column: Forms */}
                  <div>
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>1. Customer Details</h3>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Full Name *</label>
                      <input
                        type="text"
                        required
                        value={custName}
                        onChange={(e) => setCustName(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Email Address *</label>
                      <input
                        type="email"
                        required
                        value={custEmail}
                        onChange={(e) => setCustEmail(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ marginBottom: '30px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +233 24 000 0000"
                        value={custPhone}
                        onChange={(e) => setCustPhone(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                      />
                    </div>

                    {selectedFormat === 'Hard Copy' && (
                      <>
                        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>2. Physical Book Delivery Address</h3>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Country</label>
                          <input
                            type="text"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                          />
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Region / State</label>
                          <input
                            type="text"
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                          />
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>City / Town *</label>
                          <input
                            type="text"
                            required
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                          />
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Street Address *</label>
                          <input
                            type="text"
                            required
                            placeholder="House / Apartment, Street location details"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                          />
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Additional Landmarks (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Opposite Bsystems Office"
                            value={additionalAddress}
                            onChange={(e) => setAdditionalAddress(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                          />
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Postal Code / ZIP</label>
                          <input
                            type="text"
                            value={zipCode}
                            onChange={(e) => setZipCode(e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right Column: Order Summary */}
                  <div>
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
                      {selectedFormat === 'Hard Copy' ? '3.' : '2.'} Order Summary
                    </h3>
                    <div style={{ background: '#fbfbfb', padding: '25px', border: '1px solid #eee' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <span><strong>RESILIENCE — {cart?.format}</strong></span>
                        <span>GHS {(cart?.price || 0).toFixed(2)}</span>
                      </div>

                      {selectedFormat === 'Hard Copy' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', color: '#777', fontSize: '14px' }}>
                          <span>Flat Delivery Fee</span>
                          <span>GHS {(cart?.deliveryFee || 0.10).toFixed(2)}</span>
                        </div>
                      )}

                      <div style={{ borderTop: '1px solid #ddd', paddingTop: '15px', marginTop: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '18px' }}>
                        <strong>Total Amount</strong>
                        <strong>GHS {((cart?.price || 0) + (selectedFormat === 'Hard Copy' ? (cart?.deliveryFee || 0.10) : 0)).toFixed(2)}</strong>
                      </div>



                      <button
                        type="submit"
                        className="btn"
                        style={{ width: '100%', padding: '14px 0', marginTop: '10px' }}
                      >
                        Authorize & Pay
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '14px 0', marginTop: '10px' }}
                        onClick={() => setCurrentPage('store')}
                      >
                        Back to Book Page
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* SCREEN 3: Confirmation / Success and Download portal */}
        {currentPage === 'success' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: '40px 0' }}>
            <span className="ion-ios-checkmark-outline" style={{ fontSize: '72px', color: 'var(--color-success)' }}></span>
            <h1>Payment Successful</h1>
            <p style={{ fontSize: '16px', color: 'var(--color-accent)', fontWeight: '500', marginBottom: '30px' }}>
              Thank you for purchasing RESILIENCE by Thomas Akwasi Baafi.
            </p>

            <div style={{ background: '#fdfdfd', border: '1px solid #eee', padding: '30px', textAlign: 'left', marginBottom: '40px' }}>
              <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>Order Reference: {createdOrder?.orderId}</h3>
              <p style={{ fontSize: '14px', marginBottom: '10px' }}><strong>Format:</strong> {selectedFormat}</p>
              <p style={{ fontSize: '14px', marginBottom: '10px' }}><strong>Recipient:</strong> {custName}</p>
              <p style={{ fontSize: '14px', marginBottom: '10px' }}><strong>Email:</strong> {custEmail}</p>
              <p style={{ fontSize: '14px', marginBottom: '20px' }}><strong>Amount Paid:</strong> GHS {((cart?.price || 0) + (selectedFormat === 'Hard Copy' ? (cart?.deliveryFee || 0.10) : 0)).toFixed(2)}</p>

              {selectedFormat === 'Hard Copy' && (
                <div style={{ background: '#f7fff7', border: '1px solid #d4eed4', padding: '15px', fontSize: '13px', color: '#2b542c' }}>
                  <strong>Shipping Status:</strong> Your order details and delivery info have been routed to our fulfillment department. We will dispatch the physical book to <strong>{address}, {city}</strong> within 48 hours. A dispatch courier will contact you on <strong>{custPhone}</strong>.
                </div>
              )}
              {selectedFormat === 'Audiobook' && (
                <div style={{ background: '#f7faff', border: '1px solid #d4e3ee', padding: '15px', fontSize: '13px', color: '#245269' }}>
                  <strong>Audiobook Entitlement:</strong> Download is authorized. Use the download link below. This download token is linked to your email address and can be accessed up to 5 times.
                </div>
              )}
              {selectedFormat === 'Soft Copy' && (
                <div style={{ background: '#f7faff', border: '1px solid #d4e3ee', padding: '15px', fontSize: '13px', color: '#245269' }}>
                  <strong>eBook Entitlement:</strong> Download is authorized. Use the download link below. This download token is linked to your email address and can be accessed up to 5 times.
                </div>
              )}
            </div>

            {(selectedFormat === 'Audiobook' || selectedFormat === 'Soft Copy') && downloadToken && (
              <div style={{ marginBottom: '40px' }}>
                <a
                  href={`${API_URL}/audiobooks/download?token=${downloadToken}`}
                  className="btn"
                  style={{ width: '100%', padding: '15px 0', fontSize: '14px' }}
                >
                  <span className="ion-android-download" style={{ marginRight: '10px' }}></span>
                  Download {selectedFormat === 'Soft Copy' ? 'eBook (PDF)' : 'Audiobook (MP3)'}
                </a>
              </div>
            )}

            <button
              className="btn btn-secondary"
              onClick={() => { setCurrentPage('store'); resetFormState(); }}
            >
              Return to Book Page
            </button>
          </div>
        )}

      </main>

    </div>
  );
}

export default App;
