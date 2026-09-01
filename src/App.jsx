import React, { useState, useEffect, useRef, Fragment } from "react";
import { toast } from "react-hot-toast";
import "./index.css";

// Config API domain (adjust if server is running elsewhere)
const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000/api"
    : "/api");

function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return "admin";
    if (path.startsWith("/reviews")) return "reviews";
    if (new URLSearchParams(window.location.search).get("token"))
      return "review";
    return "store";
  });
  const [products, setProducts] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState("Hard Copy"); // 'Hard Copy' or 'Audiobook'
  const [cart, setCart] = useState(null);

  // Checkout Info States
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");

  // Shipping details (Ghana flat-rate example default)
  const [country, setCountry] = useState("Ghana");
  const [region, setRegion] = useState("Greater Accra");
  const [city, setCity] = useState("Accra");
  const [address, setAddress] = useState("");
  const [additionalAddress, setAdditionalAddress] = useState("");
  const [zipCode, setZipCode] = useState("");

  // Payment gateways simulation states
  const [paymentStatus, setPaymentStatus] = useState("idle"); // idle, processing, success, failed
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [downloadToken, setDownloadToken] = useState(null);

  // Soft Copy EPUB reader info modal
  const [showEpubModal, setShowEpubModal] = useState(false);
  const epubModalRef = useRef(null);

  // Admin stats
  const [adminMetrics, setAdminMetrics] = useState(null);

  // Review flow (customer side)
  const [reviewToken, setReviewToken] = useState(() =>
    new URLSearchParams(window.location.search).get("token"),
  );
  const [reviewContext, setReviewContext] = useState(null); // { orderId, name, email, product, format }
  const [reviewStatus, setReviewStatus] = useState("idle"); // idle, loading, ready, error, used
  const [reviewError, setReviewError] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewCoverLoaded, setReviewCoverLoaded] = useState(false);
  const [reviewCoverError, setReviewCoverError] = useState(false);

  // Public reviews page
  const [publicReviews, setPublicReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [reviewSort, setReviewSort] = useState("recent");
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [visibleReviewCount, setVisibleReviewCount] = useState(4);

  // Admin dashboard
  const [adminPage, setAdminPage] = useState("reviews"); // dashboard, reviews, others
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(
    () => sessionStorage.getItem("resilience_admin_token") || null,
  );
  const [adminReviews, setAdminReviews] = useState([]);
  const [adminSummary, setAdminSummary] = useState(null);
  const [adminFilter, setAdminFilter] = useState("All");
  const [adminSelectedReview, setAdminSelectedReview] = useState(null);
  const [expandedCustomer, setExpandedCustomer] = useState(null);

  // Fetch Products
  useEffect(() => {
    fetch(`${API_URL}/products`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data);
        // Pre-fill cart with selected product format
        const defaultProd = data.find((p) => p.format === selectedFormat);
        if (defaultProd) {
          setCart({ ...defaultProd, quantity: 1 });
        }
      })
      .catch((err) => console.error("Error fetching products:", err));
  }, [selectedFormat, currentPage]);

  // EPUB modal: focus management + Escape to close
  useEffect(() => {
    if (!showEpubModal) return;
    if (epubModalRef.current) epubModalRef.current.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowEpubModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showEpubModal]);

  // Verify the review token as soon as the review page opens
  useEffect(() => {
    if (currentPage !== "review" || !reviewToken) return;
    if (
      reviewStatus === "ready" ||
      reviewStatus === "error" ||
      reviewStatus === "used"
    )
      return;
    setReviewStatus("loading");
    fetch(`${API_URL}/reviews/verify?token=${encodeURIComponent(reviewToken)}`)
      .then((res) => {
        if (res.status === 409) {
          setReviewStatus("used");
          return null;
        }
        if (!res.ok) {
          return res.json().then((d) => {
            throw new Error(d.error || "This review link is invalid.");
          });
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setReviewContext(data.order);
          setReviewerName(data.order.name || "");
          setReviewStatus("ready");
        }
      })
      .catch((err) => {
        setReviewError(err.message);
        setReviewStatus("error");
      });
  }, [currentPage, reviewToken, reviewStatus]);

  // Load public reviews + summary when the reviews page (or teaser) is shown
  const loadPublicReviews = (page) => {
    if (page !== "store" && page !== "reviews") return;
    setReviewsLoading(true);
    const loadSummary = fetch(`${API_URL}/reviews/summary`)
      .then((r) => r.json())
      .then(setReviewSummary)
      .catch((err) => console.error("Error fetching review summary:", err));
    if (page === "reviews") {
      fetch(`${API_URL}/reviews`)
        .then((r) => r.json())
        .then((d) => {
          setPublicReviews(d.reviews || []);
          setVisibleReviewCount(4);
        })
        .catch((err) => console.error("Error fetching reviews:", err))
        .finally(() => setReviewsLoading(false));
    } else {
      loadSummary.finally(() => setReviewsLoading(false));
    }
  };

  useEffect(() => {
    loadPublicReviews(currentPage);
  }, [currentPage]);

  // Scroll to top on every page change so the new view starts at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Refresh public reviews whenever the tab regains focus (e.g. after approving
  // in another tab) so newly approved reviews appear without a manual reload.
  useEffect(() => {
    const onFocus = () => loadPublicReviews(currentPage);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [currentPage]);

  // Load admin data once authenticated
  useEffect(() => {
    if (currentPage !== "admin" || !adminAuthed) return;
    fetch(`${API_URL}/admin/reviews`, {
      headers: { "X-Admin-Token": adminAuthed },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setAdminReviews(data.reviews);
        setAdminSummary(data.summary);
      })
      .catch((err) => console.error("Error fetching admin reviews:", err));
    fetch(`${API_URL}/admin/metrics`, {
      headers: { "X-Admin-Token": adminAuthed },
    })
      .then((r) => r.json())
      .then(setAdminMetrics)
      .catch((err) => console.error("Error fetching admin metrics:", err));
  }, [currentPage, adminAuthed]);

  // Sync format selection to cart
  const handleFormatChange = (format) => {
    setSelectedFormat(format);
    const prod = products.find((p) => p.format === format);
    if (prod) {
      setCart({ ...prod, quantity: 1 });
    }
  };

  // Run Order Creation
  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    if (!custName || !custEmail || !custPhone) {
      alert("Please fill out all customer details.");
      return;
    }

    if (selectedFormat === "Hard Copy" && !address) {
      alert("Please provide a physical shipping address for book delivery.");
      return;
    }

    setCheckoutSubmitting(true);

    const payload = {
      customer: {
        name: custName,
        email: custEmail,
        phone: custPhone,
      },
      items: [
        {
          id: cart.id,
          quantity: 1,
        },
      ],
      shippingAddress:
        selectedFormat === "Hard Copy"
          ? {
              country,
              region,
              city,
              address,
              additionalInfo: additionalAddress,
              postalCode: zipCode,
            }
          : null,
    };

    fetch(`${API_URL}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Checkout failed");
        return res.json();
      })
      .then((data) => {
        setCreatedOrder(data);
        payWithPaystack(data);
      })
      .catch((err) => {
        setCheckoutSubmitting(false);
        alert(err.message || "Error occurred during checkout.");
      });
  };

  // Paystack Integration handler
  const payWithPaystack = (orderData) => {
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    const isMock = !publicKey || publicKey.includes("your_paystack_public_key");

    if (isMock) {
      setPaymentStatus("processing");
      setTimeout(() => {
        verifyPaymentOnBackend(
          "MOCK-REF-" + Math.floor(Math.random() * 1000000),
          orderData.orderId,
        );
      }, 2000);
      return;
    }

    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: custEmail,
      amount: Math.round(orderData.total * 100),
      currency: "GHS",
      ref: orderData.orderId,
      callback: function (response) {
        setPaymentStatus("processing");
        verifyPaymentOnBackend(response.reference, orderData.orderId);
      },
      onClose: function () {
        alert("Transaction was not completed. You closed the payment window.");
        setPaymentStatus("idle");
        setCheckoutSubmitting(false);
      },
    });
    handler.openIframe();
  };

  // Backend verification handler
  const verifyPaymentOnBackend = (reference, orderId) => {
    fetch(`${API_URL}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        orderId,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Payment verification failed");
        return res.json();
      })
      .then((data) => {
        if (data.status === "Successful") {
          setPaymentStatus("success");
          setDownloadToken(data.downloadToken);
          setCurrentPage("success");
        } else {
          setPaymentStatus("failed");
          setCheckoutSubmitting(false);
        }
      })
      .catch((err) => {
        console.error(err);
        setPaymentStatus("failed");
        setCheckoutSubmitting(false);
        alert(err.message || "Verification failed");
      });
  };

  // Submit a customer review
  const handleSubmitReview = (e) => {
    e.preventDefault();
    if (!reviewRating) {
      alert("Please select a star rating.");
      return;
    }
    if (!reviewText.trim()) {
      alert("Please write your review.");
      return;
    }
    setSubmittingReview(true);
    fetch(`${API_URL}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: reviewToken,
        rating: reviewRating,
        review: reviewText,
        name: reviewerName,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((d) => {
            throw new Error(d.error || "Could not submit your review.");
          });
        }
        return res.json();
      })
      .then(() => {
        setReviewStatus("submitted");
        setCurrentPage("review-thanks");
      })
      .catch((err) => alert(err.message))
      .finally(() => setSubmittingReview(false));
  };

  // Admin handlers
  const loadAdminReviews = () => {
    fetch(`${API_URL}/admin/reviews`, {
      headers: { "X-Admin-Token": adminAuthed },
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setAdminReviews(data.reviews);
        setAdminSummary(data.summary);
      })
      .catch((err) => console.error(err));
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (!adminPassword) {
      setAdminLoginError("Please enter the admin password.");
      return;
    }
    setAdminLoginError("");
    fetch(`${API_URL}/admin/reviews`, {
      headers: { "X-Admin-Token": adminPassword },
    })
      .then((res) => {
        if (res.status === 401) throw new Error("Incorrect admin password.");
        if (res.status === 503)
          throw new Error(
            "Admin access is not configured on the server (ADMIN_TOKEN).",
          );
        if (!res.ok) throw new Error("Could not connect to the admin API.");
        return res.json();
      })
      .then((data) => {
        sessionStorage.setItem("resilience_admin_token", adminPassword);
        setAdminAuthed(adminPassword);
        setAdminPassword("");
        setAdminReviews(data.reviews);
        setAdminSummary(data.summary);
      })
      .catch((err) => {
        sessionStorage.removeItem("resilience_admin_token");
        setAdminLoginError(err.message);
      });
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("resilience_admin_token");
    setAdminAuthed(null);
    setAdminReviews([]);
    setAdminSummary(null);
    setAdminSelectedReview(null);
    setCurrentPage("store");
  };

  const adminAction = (id, payload) => {
    fetch(`${API_URL}/admin/reviews/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": adminAuthed,
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok)
          return res.json().then((d) => {
            throw new Error(d.error || "Action failed.");
          });
        return res.json();
      })
      .then((result) => {
        loadAdminReviews();
        const msg = result?.message;
        toast.success(
          msg ||
            (payload.status === "Approved"
              ? "Review approved"
              : payload.status === "Rejected"
                ? "Review rejected"
                : payload.status === "Hidden"
                  ? "Review hidden"
                  : payload.featured
                    ? "Review featured"
                    : payload.featured === false
                      ? "Review unfeatured"
                      : "Review updated"),
        );
      })
      .catch((err) => toast.error(err.message));
  };

  const adminDeleteReview = (id) => {
    if (!window.confirm("Delete this review permanently?")) return;
    fetch(`${API_URL}/admin/reviews/${id}`, {
      method: "DELETE",
      headers: { "X-Admin-Token": adminAuthed },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Delete failed.");
        return res.json();
      })
      .then((result) => {
        loadAdminReviews();
        toast.success(result?.message || "Review deleted");
      })
      .catch((err) => toast.error(err.message));
  };

  const resetFormState = () => {
    setCustName("");
    setCustEmail("");
    setCustPhone("");
    setAddress("");
    setAdditionalAddress("");
    setZipCode("");
    setPaymentStatus("idle");
    setCreatedOrder(null);
    setDownloadToken(null);
    setReviewToken(null);
    setReviewContext(null);
    setReviewStatus("idle");
    setReviewError("");
    setReviewRating(0);
    setReviewText("");
    setReviewerName("");
    setReviewCoverLoaded(false);
    setReviewCoverError(false);
  };

  const filteredAdminReviews = adminReviews.filter((r) => {
    if (adminFilter === "All") return true;
    if (adminFilter === "Featured") return r.featured;
    return r.status === adminFilter;
  });

  // Derived admin data (orders, customers)
  const adminOrders = adminMetrics?.orders || [];
  const adminDeliveries = adminMetrics?.deliveries || [];

  const customerIndex = {};
  adminOrders.forEach((o) => {
    const email = o.customer?.email || "unknown";
    if (!customerIndex[email]) {
      customerIndex[email] = {
        name: o.customer?.name || "Unknown",
        email,
        phone: o.customer?.phone || "",
        orders: [],
        spent: 0,
      };
    }
    customerIndex[email].orders.push(o);
    customerIndex[email].spent += Number(o.total) || 0;
  });
  const adminCustomers = Object.values(customerIndex).sort(
    (a, b) => b.spent - a.spent,
  );

  const handleUpdateOrderStatus = (orderId, newStatus) => {
    fetch(`${API_URL}/admin/orders/${orderId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": adminAuthed,
      },
      body: JSON.stringify({ status: newStatus }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not update order status");
        const updated = await res.json();
        setAdminMetrics((m) =>
          m
            ? {
                ...m,
                orders: m.orders.map((o) =>
                  o.id === updated.id ? updated : o,
                ),
                deliveries: m.deliveries.map((d) =>
                  d.orderId === updated.id
                    ? { ...d, status: updated.orderStatus }
                    : d,
                ),
              }
            : m,
        );
        toast.success(`Order status updated to "${newStatus}"`);
      })
      .catch((err) => toast.error(err.message));
  };

  const sortedPublicReviews = publicReviews.slice().sort((a, b) => {
    if (reviewSort === "highest") return b.rating - a.rating;
    if (reviewSort === "lowest") return a.rating - b.rating;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const visiblePublicReviews = sortedPublicReviews.slice(0, visibleReviewCount);

  const ratingLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  const adminNavItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "orders", label: "Orders" },
    { id: "reviews", label: "Reviews", badge: adminSummary?.pending },
    { id: "customers", label: "Customers" },
  ];

  return (
    <div className="app-container">
      {/* Main App Page Handler */}
      <main>
        {/* SCREEN 1: Store / Product Page */}
        {currentPage === "store" && (
          <>
            <div className="store-grid">
              <div
                className="store-cover"
                style={{ textAlign: "center", padding: "20px" }}
              >
                <img
                  src="/img/resilience_cover.png"
                  alt="Resilience Book Cover"
                  className="hover-lift"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "480px",
                    width: "auto",
                    boxShadow: "0 15px 35px rgba(0,0,0,0.15)",
                    border: "1px solid #ddd",
                  }}
                />
              </div>
              <div
                className="store-info"
                style={{ textAlign: "left", padding: "20px" }}
              >
                <h1>RESILIENCE</h1>
                <h2>By Thomas Akwasi Baafi</h2>
                <p
                  style={{
                    fontStyle: "italic",
                    fontSize: "1.25rem",
                    color: "var(--color-accent)",
                  }}
                >
                  A Journey of Grit, Growth, and Innovation
                </p>
                <p style={{ fontSize: "17px" }}>
                  Resilience is the gripping autobiography of Thomas Akwasi
                  Baafi. It charts his remarkable path from a small, remote
                  village in Ghana, through the challenges of growing up in
                  slums, to scaling the heights of the enterprise software
                  ecosystem in West Africa.
                </p>

                <div
                  style={{
                    margin: "24px 0",
                    borderTop: "1px solid #eee",
                    paddingTop: "18px",
                  }}
                >
                  <h3 style={{ marginBottom: "15px" }}>Choose Format</h3>
                  <div className="format-selector-group">
                    <button
                      type="button"
                      className={`format-card ${selectedFormat === "Hard Copy" ? "active" : ""}`}
                      onClick={() => handleFormatChange("Hard Copy")}
                    >
                      <span className="format-check">✓</span>
                      Hard Copy
                      <span className="format-price">
                        Pay on delivery • GHS 0.30
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`format-card ${selectedFormat === "Audiobook" ? "active" : ""}`}
                      onClick={() => handleFormatChange("Audiobook")}
                    >
                      <span className="format-check">✓</span>
                      Audiobook
                      <span className="format-price">
                        Instant download • GHS 0.20
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`format-card ${selectedFormat === "Soft Copy" ? "active" : ""}`}
                      onClick={() => handleFormatChange("Soft Copy")}
                    >
                      <span className="format-check">✓</span>
                      Soft Copy
                      <span className="format-price">
                        eBook (EPUB) • GHS 0.15
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    background: "#fcfcfc",
                    padding: "20px",
                    border: "1px solid #eee",
                    marginBottom: "30px",
                  }}
                >
                  {selectedFormat === "Hard Copy" && (
                    <>
                      <h3>Hard Copy Edition</h3>
                      <p style={{ margin: 0, fontSize: "16px" }}>
                        Premium printed version of Resilience. Dispatched to
                        addresses across Ghana. Delivery fee is payable on
                        delivery. Expect delivery in 2-3 business days.
                      </p>
                    </>
                  )}
                  {selectedFormat === "Audiobook" && (
                    <>
                      <h3>Digital Audiobook Edition</h3>
                      <p style={{ margin: 0, fontSize: "16px" }}>
                        Digital MP3 download package. Playable on any device.
                        Link is generated instantly on payment confirmation.
                      </p>
                    </>
                  )}
                  {selectedFormat === "Soft Copy" && (
                    <>
                      <h3>Digital eBook Edition</h3>
                      <p style={{ margin: 0, fontSize: "16px" }}>
                        Digital EPUB ebook. Readable on Kindle, Apple Books,
                        Google Play Books, Kobo, or any other EPUB-compatible
                        reader. Link is generated instantly on payment
                        confirmation.
                      </p>
                    </>
                  )}
                </div>

                <button
                  className="btn"
                  style={{ width: "100%", padding: "15px 0", fontSize: "14px" }}
                  onClick={() => setCurrentPage("checkout")}
                >
                  Purchase Format Now
                </button>
              </div>
            </div>

            {/* Reader reviews teaser */}
            <div
              style={{
                marginTop: "60px",
                paddingTop: "40px",
                borderTop: "1px solid #eee",
                textAlign: "center",
              }}
            >
              <h3 style={{ fontSize: "1.3rem", letterSpacing: "3px" }}>
                What Readers Are Saying
              </h3>
              {reviewSummary && reviewSummary.total > 0 && (
                <p style={{ fontSize: "18px", color: "var(--color-dark)" }}>
                  <span
                    className="reviews-summary-stars"
                    aria-label={`Average rating ${reviewSummary.averageRating} out of 5`}
                  >
                    {"★".repeat(Math.round(reviewSummary.averageRating))}
                    {"☆".repeat(5 - Math.round(reviewSummary.averageRating))}
                  </span>
                  <br />
                  <strong>{reviewSummary.averageRating} / 5</strong> ·{" "}
                  {reviewSummary.total} Review
                  {reviewSummary.total === 1 ? "" : "s"}
                </p>
              )}
              {(!reviewSummary || reviewSummary.total === 0) && (
                <p>Reader reviews will appear here soon.</p>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentPage("reviews")}
              >
                Read Reader Reviews
              </button>
            </div>
          </>
        )}

        {/* SCREEN 2: Checkout Form & Payment gate simulation */}
        {currentPage === "checkout" && (
          <div
            style={{ textAlign: "left", maxWidth: "800px", margin: "0 auto" }}
          >
            <h1 style={{ fontSize: "2rem" }}>Checkout</h1>
            <h2 style={{ marginBottom: "40px" }}>Secure Booking Portal</h2>

            {paymentStatus === "processing" ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  border: "1px solid #eee",
                  background: "#fafafa",
                }}
              >
                <span
                  className="ion-load-c"
                  style={{
                    fontSize: "48px",
                    display: "block",
                    animation: "spin 1.5s infinite linear",
                    marginBottom: "20px",
                  }}
                ></span>
                <h3>Verifying Transaction</h3>
                <p>
                  Confirming transaction status with Paystack... Please do not
                  refresh the page.
                </p>
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit}>
                <div className="grid grid-2" style={{ gap: "40px" }}>
                  {/* Left Column: Forms */}
                  <div>
                    <h3
                      style={{
                        borderBottom: "1px solid #eee",
                        paddingBottom: "10px",
                        marginBottom: "20px",
                      }}
                    >
                      1. Customer Details
                    </h3>
                    <div style={{ marginBottom: "15px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                        }}
                      >
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={custName}
                        onChange={(e) => setCustName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #ddd",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: "15px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                        }}
                      >
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={custEmail}
                        onChange={(e) => setCustEmail(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #ddd",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: "30px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                        }}
                      >
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +233 24 000 0000"
                        value={custPhone}
                        onChange={(e) => setCustPhone(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #ddd",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>

                    {selectedFormat === "Hard Copy" && (
                      <>
                        <h3
                          style={{
                            borderBottom: "1px solid #eee",
                            paddingBottom: "10px",
                            marginBottom: "20px",
                          }}
                        >
                          2. Physical Book Delivery Address
                        </h3>
                        <div style={{ marginBottom: "15px" }}>
                          <label
                            style={{
                              display: "block",
                              marginBottom: "5px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            Country
                          </label>
                          <input
                            type="text"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: "15px" }}>
                          <label
                            style={{
                              display: "block",
                              marginBottom: "5px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            Region / State
                          </label>
                          <input
                            type="text"
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: "15px" }}>
                          <label
                            style={{
                              display: "block",
                              marginBottom: "5px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            City / Town *
                          </label>
                          <input
                            type="text"
                            required
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: "15px" }}>
                          <label
                            style={{
                              display: "block",
                              marginBottom: "5px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            Street Address *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="House / Apartment, Street location details"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: "15px" }}>
                          <label
                            style={{
                              display: "block",
                              marginBottom: "5px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            Additional Landmarks (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Opposite Dansoman KFC"
                            value={additionalAddress}
                            onChange={(e) =>
                              setAdditionalAddress(e.target.value)
                            }
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div style={{ marginBottom: "15px" }}>
                          <label
                            style={{
                              display: "block",
                              marginBottom: "5px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            Postal Code / ZIP
                          </label>
                          <input
                            type="text"
                            value={zipCode}
                            onChange={(e) => setZipCode(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right Column: Order Summary */}
                  <div>
                    <h3
                      style={{
                        borderBottom: "1px solid #eee",
                        paddingBottom: "10px",
                        marginBottom: "20px",
                      }}
                    >
                      {selectedFormat === "Hard Copy" ? "3." : "2."} Order
                      Summary
                    </h3>
                    <div
                      style={{
                        background: "#fbfbfb",
                        padding: "25px",
                        border: "1px solid #eee",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "15px",
                        }}
                      >
                        <span>
                          <strong>RESILIENCE — {cart?.format}</strong>
                        </span>
                        <span>GHS {(cart?.price || 0).toFixed(2)}</span>
                      </div>

                      <div
                        style={{
                          borderTop: "1px solid #ddd",
                          paddingTop: "15px",
                          marginTop: "15px",
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "18px",
                        }}
                      >
                        <strong>Total Amount</strong>
                        <strong>GHS {(cart?.price || 0).toFixed(2)}</strong>
                      </div>

                      {(() => {
                        const detailsFilled =
                          custName.trim() &&
                          custEmail.trim() &&
                          custPhone.trim() &&
                          (selectedFormat !== "Hard Copy" ||
                            (city.trim() && address.trim()));
                        const isDisabled =
                          checkoutSubmitting ||
                          paymentStatus === "processing" ||
                          !detailsFilled;
                        const opacityStyle = isDisabled ? 0.7 : 1;
                        const cursorStyle = isDisabled
                          ? "not-allowed"
                          : "pointer";
                        return (
                          <button
                            type="submit"
                            className="btn"
                            disabled={isDisabled}
                            style={{
                              width: "100%",
                              padding: "14px 0",
                              marginTop: "10px",
                              opacity: opacityStyle,
                              cursor: cursorStyle,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                            }}
                          >
                            {(checkoutSubmitting ||
                              paymentStatus === "processing") && (
                              <span
                                className="ion-load-c"
                                style={{
                                  animation: "spin 1.2s linear infinite",
                                }}
                              ></span>
                            )}
                            {checkoutSubmitting ||
                            paymentStatus === "processing"
                              ? "Processing Payment..."
                              : "Authorize & Pay"}
                          </button>
                        );
                      })()}

                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          checkoutSubmitting || paymentStatus === "processing"
                        }
                        style={{
                          width: "100%",
                          padding: "14px 0",
                          marginTop: "10px",
                          opacity:
                            checkoutSubmitting || paymentStatus === "processing"
                              ? 0.6
                              : 1,
                          cursor:
                            checkoutSubmitting || paymentStatus === "processing"
                              ? "not-allowed"
                              : "pointer",
                        }}
                        onClick={() => setCurrentPage("store")}
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
        {currentPage === "success" && (
          <div
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              textAlign: "center",
              padding: "40px 0",
            }}
          >
            <span
              className="ion-ios-checkmark-outline"
              style={{ fontSize: "72px", color: "var(--color-success)" }}
            ></span>
            <h1>Payment Successful</h1>
            <p
              style={{
                fontSize: "16px",
                color: "var(--color-accent)",
                fontWeight: "500",
                marginBottom: "30px",
              }}
            >
              Thank you for purchasing RESILIENCE by Thomas Akwasi Baafi.
            </p>

            <div
              style={{
                background: "#fdfdfd",
                border: "1px solid #eee",
                padding: "30px",
                textAlign: "left",
                marginBottom: "40px",
              }}
            >
              <h3
                style={{
                  borderBottom: "1px solid #eee",
                  paddingBottom: "10px",
                  marginBottom: "15px",
                }}
              >
                Order Reference: {createdOrder?.orderId}
              </h3>
              <p style={{ fontSize: "14px", marginBottom: "10px" }}>
                <strong>Format:</strong> {selectedFormat}
              </p>
              <p style={{ fontSize: "14px", marginBottom: "10px" }}>
                <strong>Recipient:</strong> {custName}
              </p>
              <p style={{ fontSize: "14px", marginBottom: "10px" }}>
                <strong>Email:</strong> {custEmail}
              </p>
              <p style={{ fontSize: "14px", marginBottom: "20px" }}>
                <strong>Amount Paid:</strong> GHS{" "}
                {(cart?.price || 0).toFixed(2)}
              </p>

              {selectedFormat === "Hard Copy" && (
                <div
                  style={{
                    background: "#f7fff7",
                    border: "1px solid #d4eed4",
                    padding: "15px",
                    fontSize: "13px",
                    color: "#2b542c",
                  }}
                >
                  <strong>Shipping Status:</strong> Your order details and
                  delivery info have been routed to our fulfillment department.
                  We will dispatch the physical book to{" "}
                  <strong>
                    {address}, {city}
                  </strong>{" "}
                  within 48 hours. A dispatch courier will contact you on{" "}
                  <strong>{custPhone}</strong>.
                </div>
              )}
              {selectedFormat === "Audiobook" && (
                <div
                  style={{
                    background: "#f7faff",
                    border: "1px solid #d4e3ee",
                    padding: "15px",
                    fontSize: "13px",
                    color: "#245269",
                  }}
                >
                  <strong>Audiobook Entitlement:</strong> Download is
                  authorized. Use the download link below. This download token
                  is linked to your email address and can be accessed up to 3
                  times.
                </div>
              )}
              {selectedFormat === "Soft Copy" && (
                <div
                  style={{
                    background: "#f7faff",
                    border: "1px solid #d4e3ee",
                    padding: "15px",
                    fontSize: "13px",
                    color: "#245269",
                  }}
                >
                  <strong>eBook Entitlement:</strong> Download is authorized.
                  Use the download link below. This download token is linked to
                  your email address and can be accessed up to 3 times.
                </div>
              )}
            </div>

            {(selectedFormat === "Audiobook" ||
              selectedFormat === "Soft Copy") &&
              downloadToken && (
                <div style={{ marginBottom: "40px" }}>
                  {selectedFormat === "Soft Copy" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setShowEpubModal(true)}
                      style={{
                        width: "100%",
                        padding: "15px 0",
                        fontSize: "14px",
                      }}
                    >
                      <span
                        className="ion-android-download"
                        style={{ marginRight: "10px" }}
                      ></span>
                      Download eBook (EPUB)
                    </button>
                  ) : (
                    <a
                      href={`${API_URL}/audiobooks/download?token=${downloadToken}`}
                      className="btn"
                      style={{
                        width: "100%",
                        padding: "15px 0",
                        fontSize: "14px",
                      }}
                    >
                      <span
                        className="ion-android-download"
                        style={{ marginRight: "10px" }}
                      ></span>
                      Download Audiobook (MP3)
                    </a>
                  )}
                </div>
              )}

            <button
              className="btn btn-secondary"
              onClick={() => {
                setCurrentPage("store");
                resetFormState();
              }}
            >
              Return to Book Page
            </button>
          </div>
        )}

        {/* SCREEN 4: Post-purchase review form */}
        {currentPage === "review" && (
          <div className="review-form-wrap">
            {reviewStatus === "loading" && (
              <div className="review-state review-state-center">
                <div className="review-form-card review-loading-card">
                  <div className="review-hero">
                    <div className="review-hero-cover">
                      <div className="review-cover-loader" />
                    </div>
                    <div className="review-skeleton review-skeleton-line" />
                  </div>
                  <div className="review-form-body">
                    <div className="review-spinner" />
                    <p style={{ color: "var(--color-medium)" }}>
                      Confirming your purchase…
                    </p>
                  </div>
                </div>
              </div>
            )}

            {reviewStatus === "error" && (
              <div className="review-state review-state-center">
                <img
                  src="/img/resilience_cover.png"
                  alt="RESILIENCE book cover"
                  className="review-state-cover"
                />
                <div className="review-state-icon error">!</div>
                <h1>Review Unavailable</h1>
                <p>{reviewError}</p>
                <div className="review-state-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setCurrentPage("store");
                      resetFormState();
                    }}
                  >
                    Back to Book Page
                  </button>
                </div>
              </div>
            )}

            {reviewStatus === "used" && (
              <div className="review-state review-state-center">
                <img
                  src="/img/resilience_cover.png"
                  alt="RESILIENCE book cover"
                  className="review-state-cover"
                />
                <div className="review-state-icon success">
                  <span className="ion-ios-checkmark-outline"></span>
                </div>
                <h1>Already Submitted</h1>
                <p>
                  Thank you! A review for this purchase has already been
                  submitted. It will appear once approved.
                </p>
                <div className="review-state-actions">
                  <button
                    className="btn"
                    onClick={() => setCurrentPage("reviews")}
                  >
                    Read Reader Reviews
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setCurrentPage("store")}
                  >
                    Back to Book Page
                  </button>
                </div>
              </div>
            )}

            {reviewStatus === "ready" && (
              <form className="review-form-card" onSubmit={handleSubmitReview}>
                <div className="review-hero">
                  <span className="review-hero-kicker">Reader Reviews</span>
                  <div className="review-hero-cover">
                    {reviewCoverError ? (
                      <div className="review-cover-fallback">RESILIENCE</div>
                    ) : (
                      <>
                        {!reviewCoverLoaded && (
                          <div className="review-cover-loader" />
                        )}
                        <img
                          src="/img/resilience_cover.png"
                          alt="RESILIENCE book cover"
                          onLoad={() => setReviewCoverLoaded(true)}
                          onError={() => setReviewCoverError(true)}
                          style={
                            reviewCoverLoaded
                              ? undefined
                              : { visibility: "hidden" }
                          }
                        />
                      </>
                    )}
                  </div>
                  <h1>Share Your Experience</h1>
                  <p>
                    We'd love to hear what you thought about <em>RESILIENCE</em>
                    .
                  </p>
                  <div className="review-pill">
                    {reviewContext?.format || "Hard Copy"} · Order{" "}
                    {reviewContext?.orderId}
                  </div>
                </div>

                <div className="review-form-body">
                  <div className="review-field">
                    <label>Your Rating</label>
                    <div className="rating-stars rating-stars-lg">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`star${n <= reviewRating ? " active" : ""}`}
                          onClick={() => setReviewRating(n)}
                          aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <span className="rating-label">
                      {reviewRating
                        ? `${ratingLabels[reviewRating]} (${reviewRating} / 5)`
                        : "Tap a star to rate"}
                    </span>
                  </div>

                  <div className="review-field">
                    <label>Your Review</label>
                    <textarea
                      className="review-input review-textarea"
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      maxLength={1000}
                      placeholder="Tell us what you thought about the book..."
                      rows={6}
                    />
                    <div className="review-counter">
                      {reviewText.length} / 1000
                    </div>
                  </div>

                  <div className="review-field">
                    <label>Name</label>
                    <input
                      className="review-input"
                      type="text"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder="Your display name"
                    />
                  </div>

                  <div className="review-field">
                    <label>Email</label>
                    <input
                      className="review-input review-input-disabled"
                      type="email"
                      value={reviewContext?.email || ""}
                      readOnly
                      disabled
                    />
                    <p className="review-hint">
                      Your email is used only to verify your purchase and is
                      never shown publicly.
                    </p>
                  </div>

                  <div className="review-verified">
                    <span className="review-verified-badge">
                      Verified Purchase
                    </span>
                    <p>
                      Your review will be marked as a verified purchase and will
                      appear only after approval.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="review-submit"
                    disabled={submittingReview}
                  >
                    {submittingReview ? "Submitting…" : "Submit Review"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* SCREEN 5: Review submission confirmation */}
        {currentPage === "review-thanks" && (
          <div className="review-state review-state-center">
            <img
              src="/img/resilience_cover.png"
              alt="RESILIENCE book cover"
              className="review-state-cover"
            />
            <div className="review-state-icon success">
              <span className="ion-ios-checkmark-outline"></span>
            </div>
            <div className="review-thanks-card">
              <span className="review-hero-kicker">Thank You</span>
              <h1>Review Submitted</h1>
              <p>
                Your review has been submitted successfully and is awaiting
                approval. Once approved, it will appear in our readers' reviews.
              </p>
              <div className="review-state-actions">
                <button
                  className="btn"
                  onClick={() => setCurrentPage("reviews")}
                >
                  Read Reader Reviews
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setCurrentPage("store");
                    resetFormState();
                  }}
                >
                  Return to Book Page
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 6: Public reviews page */}
        {currentPage === "reviews" && (
          <div
            style={{ maxWidth: "760px", margin: "0 auto", padding: "20px 0" }}
          >
            <div className="reviews-hero">
              <span className="reviews-hero-kicker">Reader Reviews</span>
              <div className="reviews-hero-cover">
                <img
                  src="/img/resilience_cover.png"
                  alt="RESILIENCE book cover"
                />
              </div>
              <h1>What Readers Are Saying</h1>
              <p className="reviews-hero-sub">
                {!reviewSummary || reviewSummary.total === 0
                  ? "Be the first to share your thoughts on RESILIENCE."
                  : "Honest words from readers of RESILIENCE"}
              </p>
              <span className="reviews-pill">
                <span className="reviews-pill-check">✓</span> Verified Reader
                Reviews
              </span>
            </div>

            {reviewSummary && reviewSummary.total > 0 && (
              <div className="reviews-sort">
                <span className="reviews-sort-label">Sort</span>
                {[
                  ["recent", "Most Recent"],
                  ["highest", "Highest Rated"],
                  ["lowest", "Lowest Rated"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={reviewSort === value ? "active" : ""}
                    onClick={() => {
                      setReviewSort(value);
                      setVisibleReviewCount(4);
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {reviewsLoading ? (
              <div className="review-skeletons">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="review-card review-skeleton-card">
                    <div className="review-skeleton review-skeleton-stars" />
                    <div className="review-skeleton review-skeleton-text" />
                    <div className="review-skeleton review-skeleton-text short" />
                    <div className="review-skeleton review-skeleton-avatar" />
                  </div>
                ))}
              </div>
            ) : sortedPublicReviews.length === 0 ? (
              <div className="reviews-empty">
                <span className="reviews-empty-star">★</span>
                <p>
                  No approved reviews yet. Be the first to leave one after your
                  purchase.
                </p>
              </div>
            ) : (
              <div className="reviews-list">
                {visiblePublicReviews.map((r, i) => (
                  <div
                    key={r.id}
                    className="review-card hover-lift"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div
                      className="review-stars reviews-stars-lg"
                      aria-label={`${r.rating} out of 5 stars`}
                    >
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                      {r.featured && (
                        <span className="featured-badge">Featured</span>
                      )}
                    </div>
                    <p className="review-text">"{r.review}"</p>
                    <div className="review-meta reviews-meta-row">
                      <span className="review-avatar">
                        {(r.customerName || "?")
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                      <span className="reviews-meta-text">
                        <strong>{r.customerName}</strong>
                        {r.verified && (
                          <span className="verified-badge">
                            ✓ Verified Purchase
                            {r.format ? ` · ${r.format}` : ""}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!reviewsLoading &&
              sortedPublicReviews.length > 0 &&
              visibleReviewCount < sortedPublicReviews.length && (
                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setVisibleReviewCount((n) => n + 4)}
                  >
                    Load More Reviews (
                    {sortedPublicReviews.length - visibleReviewCount} more)
                  </button>
                </div>
              )}

            <div
              style={{
                textAlign: "center",
                marginTop: "30px",
                display: "flex",
                gap: "10px",
                justifyContent: "center",
              }}
            >
              <button className="btn" onClick={() => setCurrentPage("store")}>
                Purchase RESILIENCE
              </button>
              <a
                className="btn btn-secondary"
                href="https://thomasbaafi.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Website
              </a>
            </div>
          </div>
        )}

        {/* SCREEN 7: Admin dashboard */}
        {currentPage === "admin" && (
          <div>
            {!adminAuthed ? (
              <div
                style={{
                  maxWidth: "420px",
                  margin: "60px auto",
                  textAlign: "left",
                }}
              >
                <h1>Admin</h1>
                <h2>Sign in to manage reviews</h2>
                <form onSubmit={handleAdminLogin}>
                  <div style={{ marginBottom: "15px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "5px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        textTransform: "uppercase",
                      }}
                    >
                      Admin Password
                    </label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #ddd",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                  {adminLoginError && (
                    <p
                      style={{ color: "var(--color-error)", fontSize: "14px" }}
                    >
                      {adminLoginError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="btn"
                    style={{ width: "100%", padding: "14px 0" }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      width: "100%",
                      padding: "14px 0",
                      marginTop: "10px",
                    }}
                    onClick={() => setCurrentPage("store")}
                  >
                    Back to Store
                  </button>
                </form>
              </div>
            ) : (
              <div className="admin-layout">
                <aside className="admin-sidebar">
                  <div
                    style={{
                      padding: "16px 20px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <strong
                      style={{
                        fontFamily: "var(--font-secondary)",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        fontSize: "13px",
                        color: "var(--color-dark)",
                      }}
                    >
                      ADMIN
                    </strong>
                  </div>
                  {adminNavItems.map((item) => (
                    <button
                      key={item.id}
                      className={adminPage === item.id ? "active" : ""}
                      onClick={() => setAdminPage(item.id)}
                    >
                      {item.label}
                      {item.badge ? ` (${item.badge})` : ""}
                    </button>
                  ))}
                  <div
                    style={{
                      padding: "12px 20px",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    <button
                      onClick={handleAdminLogout}
                      style={{ color: "var(--color-error)" }}
                    >
                      Sign Out
                    </button>
                  </div>
                </aside>

                <div className="admin-content" style={{ minWidth: 0 }}>
                  {adminPage === "reviews" && (
                    <div>
                      <h1>Reviews</h1>
                      {adminSummary && (
                        <div className="admin-summary-cards">
                          <div>
                            <strong>{adminSummary.total}</strong>
                            <span>Total Reviews</span>
                          </div>
                          <div>
                            <strong>{adminSummary.pending}</strong>
                            <span>Pending</span>
                          </div>
                          <div>
                            <strong>{adminSummary.approved}</strong>
                            <span>Approved</span>
                          </div>
                          <div>
                            <strong>{adminSummary.rejected}</strong>
                            <span>Rejected</span>
                          </div>
                          <div>
                            <strong>{adminSummary.averageRating} ★</strong>
                            <span>Average Rating</span>
                          </div>
                        </div>
                      )}

                      {adminSelectedReview ? (
                        <div className="admin-review-detail">
                          <button
                            className="btn btn-secondary"
                            onClick={() => setAdminSelectedReview(null)}
                          >
                            ← Back to list
                          </button>

                          <div
                            style={{
                              border: "1px solid var(--color-border)",
                              padding: "24px",
                              marginTop: "20px",
                            }}
                          >
                            <h3 style={{ marginBottom: "6px" }}>Reviewer</h3>
                            <p style={{ marginBottom: "4px" }}>
                              <strong>
                                {adminSelectedReview.customerName}
                              </strong>
                            </p>
                            <p
                              style={{ fontSize: "14px", marginBottom: "20px" }}
                            >
                              Email: {adminSelectedReview.customerEmail}
                            </p>

                            <h3 style={{ marginBottom: "6px" }}>Rating</h3>
                            <p
                              className="review-stars"
                              style={{ fontSize: "20px", marginBottom: "20px" }}
                            >
                              {"★".repeat(adminSelectedReview.rating)}
                              {"☆".repeat(5 - adminSelectedReview.rating)}
                            </p>

                            <h3 style={{ marginBottom: "6px" }}>Review</h3>
                            <blockquote
                              style={{
                                fontStyle: "italic",
                                borderLeft: "3px solid var(--color-border)",
                                paddingLeft: "16px",
                                marginBottom: "20px",
                                color: "var(--color-dark)",
                              }}
                            >
                              "{adminSelectedReview.review}"
                            </blockquote>

                            <h3 style={{ marginBottom: "6px" }}>Purchase</h3>
                            <p
                              style={{ fontSize: "14px", marginBottom: "4px" }}
                            >
                              <strong>Product:</strong> RESILIENCE
                            </p>
                            <p
                              style={{ fontSize: "14px", marginBottom: "4px" }}
                            >
                              <strong>Format:</strong>{" "}
                              {adminSelectedReview.format}
                            </p>
                            <p
                              style={{ fontSize: "14px", marginBottom: "4px" }}
                            >
                              <strong>Order:</strong>{" "}
                              {adminSelectedReview.orderId}
                            </p>
                            <p
                              style={{ fontSize: "14px", marginBottom: "4px" }}
                            >
                              <strong>Payment:</strong>{" "}
                              {adminSelectedReview.paymentStatus}
                            </p>
                            <p
                              style={{ fontSize: "14px", marginBottom: "4px" }}
                            >
                              <strong>Verified Purchase:</strong>{" "}
                              {adminSelectedReview.verified ? "✓ Yes" : "No"}
                            </p>
                            <p
                              style={{ fontSize: "14px", marginBottom: "4px" }}
                            >
                              <strong>Submitted:</strong>{" "}
                              {new Date(
                                adminSelectedReview.createdAt,
                              ).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>

                          <div className="admin-actions">
                            {adminSelectedReview.status === "Pending" && (
                              <>
                                <button
                                  className="btn"
                                  onClick={() =>
                                    adminAction(adminSelectedReview.id, {
                                      status: "Approved",
                                    })
                                  }
                                >
                                  APPROVE
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() =>
                                    adminAction(adminSelectedReview.id, {
                                      status: "Rejected",
                                    })
                                  }
                                >
                                  REJECT
                                </button>
                              </>
                            )}
                            {adminSelectedReview.status === "Approved" && (
                              <>
                                <button
                                  className="btn"
                                  onClick={() =>
                                    adminAction(adminSelectedReview.id, {
                                      featured: !adminSelectedReview.featured,
                                    })
                                  }
                                >
                                  {adminSelectedReview.featured
                                    ? "UNFEATURE"
                                    : "FEATURE"}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() =>
                                    adminAction(adminSelectedReview.id, {
                                      status: "Hidden",
                                    })
                                  }
                                >
                                  HIDE
                                </button>
                              </>
                            )}
                            {adminSelectedReview.status === "Hidden" && (
                              <button
                                className="btn"
                                onClick={() =>
                                  adminAction(adminSelectedReview.id, {
                                    status: "Approved",
                                  })
                                }
                              >
                                RESTORE
                              </button>
                            )}
                            {adminSelectedReview.status === "Rejected" && (
                              <button
                                className="btn"
                                onClick={() =>
                                  adminAction(adminSelectedReview.id, {
                                    status: "Approved",
                                  })
                                }
                              >
                                APPROVE
                              </button>
                            )}
                            <button
                              className="btn btn-secondary admin-danger"
                              onClick={() =>
                                adminDeleteReview(adminSelectedReview.id)
                              }
                            >
                              DELETE
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="admin-filters">
                            {[
                              "All",
                              "Pending",
                              "Approved",
                              "Rejected",
                              "Hidden",
                              "Featured",
                            ].map((f) => (
                              <button
                                key={f}
                                className={`filter-btn${adminFilter === f ? " active" : ""}`}
                                onClick={() => setAdminFilter(f)}
                              >
                                {f}
                              </button>
                            ))}
                          </div>

                          {filteredAdminReviews.length === 0 ? (
                            <p
                              style={{
                                padding: "40px 0",
                                textAlign: "center",
                                color: "var(--color-medium)",
                              }}
                            >
                              No reviews match this filter.
                            </p>
                          ) : (
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Reviewer</th>
                                  <th>Rating</th>
                                  <th>Review</th>
                                  <th>Format</th>
                                  <th>Verified</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredAdminReviews.map((r) => (
                                  <tr
                                    key={r.id}
                                    className="clickable"
                                    onClick={() => setAdminSelectedReview(r)}
                                  >
                                    <td>{r.customerName}</td>
                                    <td>
                                      <span className="review-stars">
                                        {"★".repeat(r.rating)}
                                      </span>
                                    </td>
                                    <td>
                                      {r.review.length > 60
                                        ? r.review.slice(0, 60) + "…"
                                        : r.review}
                                    </td>
                                    <td>{r.format}</td>
                                    <td>{r.verified ? "✓" : "—"}</td>
                                    <td>
                                      <span
                                        className={`status-badge ${r.status.toLowerCase()}`}
                                      >
                                        {r.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {adminPage === "dashboard" && (
                    <div>
                      <h1>Dashboard</h1>
                      <div className="admin-summary-cards">
                        <div>
                          <strong>{adminMetrics?.totalOrders ?? "—"}</strong>
                          <span>Total Orders</span>
                        </div>
                        <div>
                          <strong>{adminMetrics?.paidOrders ?? "—"}</strong>
                          <span>Paid Orders</span>
                        </div>
                        <div>
                          <strong>
                            GHS {(adminMetrics?.revenue ?? 0).toFixed(2)}
                          </strong>
                          <span>Revenue</span>
                        </div>
                        <div>
                          <strong>{adminMetrics?.downloads ?? "—"}</strong>
                          <span>Downloads</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {adminPage === "orders" && (
                    <div>
                      <h1>Orders</h1>
                      {adminOrders.length === 0 ? (
                        <p
                          style={{
                            padding: "40px 0",
                            textAlign: "center",
                            color: "var(--color-medium)",
                          }}
                        >
                          No orders yet.
                        </p>
                      ) : (
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Order</th>
                              <th>Customer</th>
                              <th>Product</th>
                              <th>Total</th>
                              <th>Payment</th>
                              <th>Delivery</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminOrders.map((o) => {
                              const isHardCopy = o.products?.some(
                                (p) => p.format === "Hard Copy",
                              );
                              const delivery = adminDeliveries.find(
                                (d) => d.orderId === o.id,
                              );
                              const deliveryStatus =
                                delivery?.status || o.orderStatus;
                              return (
                                <tr key={o.id}>
                                  <td>{o.id}</td>
                                  <td>
                                    {o.customer?.name}
                                    <br />
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--color-medium)",
                                      }}
                                    >
                                      {o.customer?.email}
                                      {isHardCopy && o.customer?.phone && (
                                        <>
                                          <br />
                                          Phone: {o.customer.phone}
                                        </>
                                      )}
                                    </span>
                                  </td>
                                  <td>
                                    {o.products
                                      ?.map((p) => p.name)
                                      .join(", ") || "—"}
                                  </td>
                                  <td>GHS {Number(o.total || 0).toFixed(2)}</td>
                                  <td>
                                    <span
                                      className={`status-badge ${(o.paymentStatus || "").toLowerCase()}`}
                                    >
                                      {o.paymentStatus || "—"}
                                    </span>
                                  </td>
                                  <td>
                                    {isHardCopy ? (
                                      <>
                                        {delivery && (
                                          <div
                                            style={{
                                              fontSize: "13px",
                                              lineHeight: "1.5",
                                              marginBottom: "8px",
                                            }}
                                          >
                                            {[delivery.address, delivery.city]
                                              .filter(Boolean)
                                              .join(", ")}
                                            <br />
                                            {[delivery.region, delivery.country]
                                              .filter(Boolean)
                                              .join(", ")}
                                            {delivery.postalCode &&
                                              `, ${delivery.postalCode}`}
                                            {delivery.additionalInfo && (
                                              <>
                                                <br />
                                                {delivery.additionalInfo}
                                              </>
                                            )}
                                          </div>
                                        )}
                                        <select
                                          value={deliveryStatus}
                                          onChange={(e) =>
                                            handleUpdateOrderStatus(
                                              o.id,
                                              e.target.value,
                                            )
                                          }
                                          style={{
                                            padding: "6px 8px",
                                            border:
                                              "1px solid var(--color-border)",
                                            fontFamily: "inherit",
                                            fontSize: "13px",
                                          }}
                                        >
                                          {[
                                            "Payment Received",
                                            "Processing",
                                            "Shipped",
                                            "Delivered",
                                            "Cancelled",
                                          ].map((s) => (
                                            <option key={s} value={s}>
                                              {s}
                                            </option>
                                          ))}
                                        </select>{" "}
                                        {deliveryStatus === "Delivered" && (
                                          <span className="status-badge approved">
                                            Delivered
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="status-badge hidden">
                                        Digital — {o.orderStatus || "Completed"}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {o.date
                                      ? new Date(o.date).toLocaleDateString()
                                      : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {adminPage === "customers" && (
                    <div>
                      <h1>Customers</h1>
                      {adminCustomers.length === 0 ? (
                        <p
                          style={{
                            padding: "40px 0",
                            textAlign: "center",
                            color: "var(--color-medium)",
                          }}
                        >
                          No customers yet.
                        </p>
                      ) : (
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Customer</th>
                              <th>Email</th>
                              <th>Orders</th>
                              <th>Total Spent</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminCustomers.map((c) => (
                              <Fragment key={c.email}>
                                <tr
                                  className="clickable"
                                  onClick={() =>
                                    setExpandedCustomer(
                                      expandedCustomer === c.email
                                        ? null
                                        : c.email,
                                    )
                                  }
                                >
                                  <td>
                                    {c.name}
                                    {c.phone ? (
                                      <span className="admin-customer-phone">
                                        {c.phone}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td>{c.email}</td>
                                  <td>{c.orders.length}</td>
                                  <td>GHS {c.spent.toFixed(2)}</td>
                                  <td className="admin-customer-caret">
                                    {expandedCustomer === c.email ? "▲" : "▼"}
                                  </td>
                                </tr>
                                {expandedCustomer === c.email && (
                                  <tr>
                                    <td
                                      colSpan="5"
                                      style={{ padding: "0 12px" }}
                                    >
                                      <div className="admin-customer-detail">
                                        {c.orders.map((o) => {
                                          const delivery = adminDeliveries.find(
                                            (d) => d.orderId === o.id,
                                          );
                                          return (
                                            <div
                                              key={o.id}
                                              className="admin-customer-order"
                                            >
                                              <div className="admin-customer-order-head">
                                                <strong>{o.id}</strong>
                                                <span className="status-badge neutral">
                                                  {o.orderStatus}
                                                </span>
                                                <span className="status-badge successful">
                                                  {o.paymentStatus}
                                                </span>
                                                <span>
                                                  GHS {o.total.toFixed(2)}
                                                </span>
                                                <span>
                                                  {new Date(
                                                    o.date,
                                                  ).toLocaleDateString()}
                                                </span>
                                              </div>
                                              <div className="admin-customer-order-prods">
                                                {o.products.map((p) => (
                                                  <span
                                                    key={p.id}
                                                    className="admin-customer-prod"
                                                  >
                                                    {p.name} · {p.format} ×{" "}
                                                    {p.quantity} — GHS{" "}
                                                    {(
                                                      Number(p.price) *
                                                      p.quantity
                                                    ).toFixed(2)}
                                                  </span>
                                                ))}
                                              </div>
                                              {delivery && (
                                                <div className="admin-customer-delivery">
                                                  <span className="admin-customer-delivery-title">
                                                    Delivery Address
                                                  </span>
                                                  <p>
                                                    {delivery.address
                                                      ? `${delivery.address}, `
                                                      : ""}
                                                    {delivery.city},{" "}
                                                    {delivery.region}{" "}
                                                    {delivery.postalCode},{" "}
                                                    {delivery.country}
                                                    {delivery.additionalInfo
                                                      ? ` · ${delivery.additionalInfo}`
                                                      : ""}
                                                  </p>
                                                  <p>
                                                    Delivery status:{" "}
                                                    {delivery.status}
                                                  </p>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showEpubModal && (
        <div
          className="epub-modal-overlay"
          role="presentation"
          onClick={() => setShowEpubModal(false)}
        >
          <div
            className="epub-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="epub-modal-title"
            tabIndex={-1}
            ref={epubModalRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="epub-modal-close"
              aria-label="Close"
              onClick={() => setShowEpubModal(false)}
            >
              ×
            </button>
            <div className="epub-modal-head" aria-hidden="true">
              <span className="epub-modal-icon">📖</span>
            </div>
            <h3 id="epub-modal-title">Before you download</h3>
            <p className="epub-modal-lead">
              Your RESILIENCE Soft Copy is an <strong>EPUB ebook</strong> — not
              a PDF. Open it with any book-friendly reading app.
            </p>
            <div className="epub-modal-apps">
              <span className="epub-modal-apps-label">Read it with</span>
              <ul>
                <li>
                  <span className="epub-app-emoji">📱</span>
                  <span>Kindle</span>
                </li>
                <li>
                  <span className="epub-app-emoji">📚</span>
                  <span>Apple Books</span>
                </li>
                <li>
                  <span className="epub-app-emoji">▶️</span>
                  <span>Google Play Books</span>
                </li>
                <li>
                  <span className="epub-app-emoji">📖</span>
                  <span>Kobo</span>
                </li>
              </ul>
            </div>
            <p className="epub-modal-note">
              Once downloaded, open the <code>resilience.epub</code> file with
              any compatible ebook reader to start reading.
            </p>
            <div className="epub-modal-actions">
              <button
                type="button"
                className="btn epub-modal-primary"
                onClick={() => {
                  setShowEpubModal(false);
                  window.location.href = `${API_URL}/audiobooks/download?token=${downloadToken}`;
                }}
              >
                Download
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowEpubModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
