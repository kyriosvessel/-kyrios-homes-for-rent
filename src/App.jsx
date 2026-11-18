import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, BedDouble, Bath, Menu, User, ArrowRight, Lock, Mail, Phone, Eye, EyeOff, X } from 'lucide-react';
import './App.css';
import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize
} from '@capacitor-community/admob';




function BrandLogo({ name = "KYRIOS", subtitle = "HOMES FOR RENT", initials = "KH" }) {
  return (
    <a className="brand" href="#" aria-label="Kyrios Homes For Rent home">
      <span className="brand-icon">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path className="logo-roof" d="M7 29 32 8l25 21" />
          <path className="logo-house" d="M14 25v31h36V25" />
          <text x="32" y="45" textAnchor="middle">{initials}</text>
        </svg>
      </span>
      <span className="brand-name">
        <strong>{name}</strong>
        <b>{subtitle}</b>
      </span>
    </a>
  );
}


function AgentPortal({ onClose, onLogin, initialMode, logoName, logoSubtitle, logoInitials }) {
  const [mode, setMode] = useState(initialMode || 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const form = new FormData(e.currentTarget);
    const email = form.get('email');
    const password = form.get('password');

    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: form.get('full_name'),
              phone: form.get('phone')
            }
          }
        });

        if (error) throw error;

        setMessage(
          data.session
            ? 'Your account has been created successfully.'
            : 'Registration received. Please check your email for the confirmation link.'
        );
      } else {
        const { data: loginData, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        const { data: reward, error: rewardError } =
          await supabase.rpc('reward_agent_login');

        if (rewardError) {
          setMessage('Signed in, but the login point could not be recorded: ' + rewardError.message);
          onLogin(loginData.user);
        } else {
          const { data: points } = await supabase
            .from('agent_points')
            .select('balance')
            .eq('user_id', loginData.user.id)
            .maybeSingle();

          setMessage(
            reward === 1
              ? 'Signed in successfully! You earned 1 point. Your balance: ' + (points?.balance ?? 0) + ' points.'
              : 'Signed in successfully! This login session has already received its point. Your balance: ' + (points?.balance ?? 0) + ' points.'
          );
          onLogin(loginData.user);
        }
      }
    } catch (error) {
      setMessage(error.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="portal-overlay" onClick={onClose}>
      <section className="portal-card" onClick={e => e.stopPropagation()}>
        <button className="portal-close" onClick={onClose} aria-label="Close">
          <X size={21} />
        </button>

        <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
        <div className="portal-heading">
          <span className="eyebrow">KYRIOS AGENT PORTAL</span>
          <h2>{mode === 'login' ? 'Welcome back' : 'Join our agent network'}</h2>
          <p>{mode === 'login'
            ? 'Sign in to manage your property listings.'
            : 'Create your agent account to start listing properties.'}</p>
        </div>

        <div className="portal-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => {setMode('login'); setMessage('');}}>Sign In</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => {setMode('register'); setMessage('');}}>Create Account</button>
        </div>

        <form className="portal-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <label>Full name
                <div><User size={18}/><input name="full_name" required placeholder="Enter your full name" /></div>
              </label>
              <label>Phone number
                <div><Phone size={18}/><input name="phone" required type="tel" placeholder="Enter your phone number" /></div>
              </label>
            </>
          )}

          <label>Email address
            <div><Mail size={18}/><input name="email" required type="email" placeholder="Enter your email address" /></div>
          </label>

          <label>Password
            <div>
              <Lock size={18}/>
              <input name="password" required type={showPassword ? 'text' : 'password'} minLength="6" placeholder="Enter your password"/>
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </label>

          {message && <p className="portal-message">{message}</p>}

          <button className="portal-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In to Your Account' : 'Create Agent Account'}
            <ArrowRight size={18}/>
          </button>
        </form>

        <p className="portal-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already registered?'}
          <button onClick={() => {setMode(mode === 'login' ? 'register' : 'login'); setMessage('');}}>
            {mode === 'login' ? 'Create account' : 'Sign in'}
          </button>
        </p>
        <p className="portal-security"><Lock size={13}/> Your account security matters to us.</p>
      </section>
    </div>
  );
}



function AgentDashboard({ user, onLogout, onHome, backHandlerRef, openEnquiries = false, onEnquiriesOpened, enquiryCount, logoName, logoSubtitle, logoInitials }) {
  const [profile, setProfile] = useState(null);
  const [points, setPoints] = useState(0);
  const [properties, setProperties] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [housingRequests, setHousingRequests] = useState([]);
  const [showHousingRequests, setShowHousingRequests] = useState(false);
  const [viewedAgentRequestKeys, setViewedAgentRequestKeys] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kyriosAgentViewedRequests:' + user.id) || '[]');
    } catch {
      return [];
    }
  });
  const [promotions, setPromotions] = useState([]);
  const [promotionDays, setPromotionDays] = useState({});
  const [promotionMessage, setPromotionMessage] = useState('');
  const [promotingProperty, setPromotingProperty] = useState(null);
  const [showEnquiries, setShowEnquiries] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdvertForm, setShowAdvertForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [purchaseMessage, setPurchaseMessage] = useState('');
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [showBuyPoints, setShowBuyPoints] = useState(false);
  const [purchaseMethod, setPurchaseMethod] = useState('MTN Recharge Card');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [editingProperty, setEditingProperty] = useState(null);
  const [verification, setVerification] = useState(null);
  const [showVerificationPage, setShowVerificationPage] = useState(false);
  const [showMyListingsPage, setShowMyListingsPage] = useState(false);
  const [listingStatusFilter, setListingStatusFilter] = useState('all');
  const [governmentIdType, setGovernmentIdType] = useState('National ID');
  const [governmentIdFile, setGovernmentIdFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  useEffect(() => {
    if (!backHandlerRef) return;
    backHandlerRef.current = () => {
      if (showAdvertForm) { setShowAdvertForm(false); setEditingProperty(null); return; }
      if (showBuyPoints) { setShowBuyPoints(false); return; }
      if (showVerificationPage) { setShowVerificationPage(false); return; }

  if (showMyListingsPage) { setShowMyListingsPage(false); return; }
      if (showHousingRequests) { setShowHousingRequests(false); return; }
      if (showEnquiries) { setShowEnquiries(false); onEnquiriesOpened?.(); return; }
      onHome?.();
    };
    return () => { backHandlerRef.current = null; };
  }, [backHandlerRef, showAdvertForm, showBuyPoints, showVerificationPage,
      showMyListingsPage, showHousingRequests, showEnquiries, onEnquiriesOpened, onHome]);



  async function handleDeleteProperty(property) {
    if (!window.confirm(`Delete ${property.title}?`)) return;
    const { error } = await supabase.from('properties')
      .delete().eq('id', property.id).eq('agent_id', user.id);
    if (error) {
      setFormMessage(error.message);
      return;
    }
    setFormMessage('Listing deleted successfully.');
    await loadDashboard();
  }

  function handleEditProperty(property) {
    setEditingProperty(property);
    setShowAdvertForm(true);
  }

  async function handleAvailabilityChange(propertyId, availabilityStatus) {
    const { error } = await supabase.rpc('update_property_availability', {
      p_property_id: propertyId,
      p_availability_status: availabilityStatus
    });

    if (error) {
      setFormMessage('Availability update failed: ' + error.message);
      return;
    }

    setFormMessage('Property availability changed to ' + availabilityStatus + '.');
    await loadDashboard();
  }


  async function loadDashboard() {
    setLoading(true);
    setError('');

    const [profileResult, pointsResult, propertyResult, enquiryResult, housingResult, promotionResult, purchaseResult, verificationResult] = await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
      supabase.from('agent_points').select('balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('properties').select('id, title, status, availability_status, property_type, city, state, area, address, rent_amount, agreement_fee, agency_fee, caution_fee, bedrooms, bathrooms, description, contact_phone, first_payment_total, photo_urls, created_at').eq('agent_id', user.id).order('created_at', { ascending: false }),
      supabase.from('enquiries').select('id, property_id, customer_name, customer_phone, message, status, created_at').eq('agent_id', user.id).order('created_at', { ascending: false }),
      supabase.from('housing_requests').select('id, customer_name, customer_phone, state, city, area, budget, property_type, bedrooms, description, status, created_at').order('created_at', { ascending: false }),
      supabase.from('property_promotions').select('property_id, starts_at, expires_at').eq('agent_id', user.id),
      supabase.from('point_purchase_requests').select('id, payment_method, amount_paid, status, points_awarded, created_at, admin_note').eq('agent_id', user.id).order('created_at', { ascending: false }),
      supabase.from('agent_verifications').select('government_id_type,status,admin_note,submitted_at,reviewed_at').eq('agent_id', user.id).maybeSingle()
    ]);

    if (profileResult.error || pointsResult.error || propertyResult.error || enquiryResult.error || housingResult.error || promotionResult.error || purchaseResult.error) {
      setError('Could not load all dashboard information. Please refresh and try again.');
    }

    setProfile(profileResult.data);
    setVerification(verificationResult.data || null);
    setPoints(pointsResult.data?.balance ?? 0);
    setProperties(propertyResult.data || []);
    setPromotions(promotionResult.data || []);
    setPurchaseRequests(purchaseResult.data || []);
    setEnquiries(enquiryResult.data || []);
    setHousingRequests(housingResult.data || []);
    setLoading(false);
  }


async function submitAgentVerification(event) {
    event.preventDefault();
    setVerificationMessage('');

    if (!governmentIdFile || !selfieFile) {
      setVerificationMessage('Please select both your government ID and selfie.');
      return;
    }

    const allowedIdTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const allowedSelfieTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedIdTypes.includes(governmentIdFile.type)) {
      setVerificationMessage('Government ID must be a PDF, JPG, PNG or WebP file.');
      return;
    }
    if (!allowedSelfieTypes.includes(selfieFile.type)) {
      setVerificationMessage('Selfie must be a JPG, PNG or WebP image.');
      return;
    }
    if (governmentIdFile.size > maxSize || selfieFile.size > maxSize) {
      setVerificationMessage('Each file must be 5 MB or smaller.');
      return;
    }

    setVerificationSubmitting(true);
    try {
      const makePath = (file, label) => {
        const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'file';
        const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 9);
        return user.id + '/' + unique + '-' + label + '.' + extension;
      };

      const idPath = makePath(governmentIdFile, 'government-id');
      const selfiePath = makePath(selfieFile, 'selfie');

      const { error: idUploadError } = await supabase.storage
        .from('agent-verification')
        .upload(idPath, governmentIdFile, { contentType: governmentIdFile.type, upsert: false });

      if (idUploadError) throw idUploadError;

      const { error: selfieUploadError } = await supabase.storage
        .from('agent-verification')
        .upload(selfiePath, selfieFile, { contentType: selfieFile.type, upsert: false });

      if (selfieUploadError) throw selfieUploadError;

      const { error: submitError } = await supabase.rpc('submit_agent_verification', {
        p_government_id_type: governmentIdType,
        p_government_id_path: idPath,
        p_selfie_path: selfiePath
      });

      if (submitError) throw submitError;

      setVerificationMessage('Your verification documents were submitted successfully.');
      setGovernmentIdFile(null);
      setSelfieFile(null);
      await loadDashboard();
    } catch (err) {
      setVerificationMessage(err.message || 'Verification submission failed. Please try again.');
    } finally {
      setVerificationSubmitting(false);
    }
  }

function openAgentRequest(request) {
    const next = [...new Set([...viewedAgentRequestKeys, request.key])];
    setViewedAgentRequestKeys(next);
    try {
      localStorage.setItem('kyriosAgentViewedRequests:' + user.id, JSON.stringify(next));
    } catch {}
    if (request.requestTab === 'enquiries') {
      setShowEnquiries(true);
    } else {
      setShowHousingRequests(true);
    }
  }

  async function handlePromoteProperty(propertyId) {
    const days = Number(promotionDays[propertyId] || 1);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setPromotionMessage('Choose between 1 and 365 days.');
      return;
    }

    setPromotingProperty(propertyId);
    setPromotionMessage('');

    const { error } = await supabase.rpc('promote_property', {
      p_property_id: propertyId,
      p_days: days
    });

    if (error) {
      setPromotionMessage(error.message);
    } else {
      setPromotionMessage(`Promotion activated. ${days} day(s), ${days * 200} coins deducted.`);
      await loadDashboard();
    }
    setPromotingProperty(null);
  }

  useEffect(() => {
    loadDashboard();
  }, [user.id]);

  useEffect(() => {
    if (openEnquiries) {
      setShowEnquiries(true);
      loadDashboard();
      if (onEnquiriesOpened) onEnquiriesOpened();
    }
  }, [openEnquiries]);

  const pending = properties.filter(p => p.status === 'pending').length;
  const approved = properties.filter(p => p.status === 'approved').length;
  const availableForAdverts = Math.max(0, points - pending);

  const newCustomerRequests = [
    ...enquiries.filter(r => !r.status || r.status === 'new').map(r => ({
      ...r, key: 'enquiry-' + r.id, requestTab: 'enquiries',
      typeLabel: 'Property enquiry',
      propertyTitle: properties.find(p => p.id === r.property_id)?.title || 'Your property'
    })),
    ...housingRequests.filter(r => !r.status || r.status === 'new').map(r => ({
      ...r, key: 'housing-' + r.id, requestTab: 'housing',
      typeLabel: 'Housing request',
      propertyTitle: [r.city, r.state].filter(Boolean).join(', ')
    }))
  ]
    .filter(r => !viewedAgentRequestKeys.includes(r.key))
    .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));


  async function handlePointPurchaseSubmit(e) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const method = form.get('payment_method');
    const amount = Number(form.get('amount_paid'));
    const proof = form.get('proof');
    const pin = String(form.get('recharge_pin') || '').trim();

    if (!Number.isFinite(amount) || amount < 500) {
      setPurchaseMessage('Minimum payment is ₦500.');
      return;
    }
    if (method === 'MTN Recharge Card' && pin.length < 10) {
      setPurchaseMessage('Enter the complete MTN recharge PIN.');
      return;
    }
    if (method === 'Bank Transfer' && (!proof || !proof.size)) {
      setPurchaseMessage('Upload your bank transfer receipt.');
      return;
    }

    setPurchaseSubmitting(true);
    setPurchaseMessage('');
    let proofPath = null;

    try {
      if (method === 'Bank Transfer') {
        const extension = (proof.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
        proofPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('point-payment-proofs')
          .upload(proofPath, proof, { upsert: false });
        if (uploadError) throw uploadError;
      }

      const { data: request, error: requestError } = await supabase
        .from('point_purchase_requests')
        .insert({
          agent_id: user.id,
          payment_method: method,
          amount_paid: amount,
          sender_phone: String(form.get('sender_phone') || '').trim() || null,
          bank_name: String(form.get('bank_name') || '').trim() || null,
          sender_name: String(form.get('sender_name') || '').trim() || null,
          transfer_reference: String(form.get('transfer_reference') || '').trim() || null,
          proof_path: proofPath,
          status: 'pending'
        })
        .select('id')
        .single();

      if (requestError) throw requestError;

      if (method === 'MTN Recharge Card') {
        const { error: pinError } = await supabase
          .from('mtn_recharge_submissions')
          .insert({
            request_id: request.id,
            recharge_pin: pin,
            serial_number: String(form.get('serial_number') || '').trim() || null
          });
        if (pinError) throw pinError;
      }

      formElement.reset();
      setPurchaseAmount('');
      setPurchaseMessage('Purchase request submitted. Await admin verification.');
      await loadDashboard();
    } catch (err) {
      setPurchaseMessage(err.message || 'Could not submit your purchase request.');
    } finally {
      setPurchaseSubmitting(false);
    }
  }

  async function handleAdvertSubmit(e) {
    e.preventDefault();
    const formElement = e.currentTarget;
    let stage = 'Preparing advert';
    setSubmitting(true);
    setFormMessage('');

    const form = new FormData(e.currentTarget);
    const files = Array.from(form.getAll('photos')).filter(file => file instanceof File && file.size > 0);
    const uploadedUrls = [];

    try {


      if (files.length > 8) {
        throw new Error('You can upload a maximum of 8 photos.');
      }

      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error('Only JPG, PNG and WebP photos are allowed.');
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('Each photo must be 5 MB or smaller.');
        }
      }

      stage = 'Uploading property photos';
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${user.id}/${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('property-photos')
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from('property-photos')
          .getPublicUrl(path);

        uploadedUrls.push(publicData.publicUrl);
      }

      stage = 'Saving property advert';
      let submitError;
      const data = {
        title: form.get('title').trim(),
        property_type: form.get('property_type'),
        state: form.get('state').trim(),
        city: form.get('city').trim(),
        area: form.get('area').trim(),
        address: form.get('address').trim(),
        rent_amount: Number(form.get('rent_amount')),
        first_payment_total: Number(form.get('first_payment_total')),
        description: form.get('description').trim(),
        contact_phone: form.get('contact_phone').trim()
      };

      if (editingProperty) {
        const { error } = await supabase.from('properties').update({
          ...data,
          photo_urls: uploadedUrls.length ? uploadedUrls : editingProperty.photo_urls,
          status: 'pending'
        }).eq('id', editingProperty.id).eq('agent_id', user.id);
        submitError = error;
      } else {
        const { data: propertyId, error } = await supabase.rpc('submit_property_advert', {
          p_title: data.title,
          p_property_type: data.property_type,
          p_state: data.state,
          p_city: data.city,
          p_area: data.area,
          p_address: data.address,
          p_rent_amount: data.rent_amount,
          p_agreement_fee: 0,
          p_agency_fee: 0,
          p_caution_fee: 0,
          p_bedrooms: 0,
          p_bathrooms: 0,
          p_description: data.description,
          p_contact_phone: data.contact_phone,
          p_photo_urls: uploadedUrls,
          p_first_payment_total: data.first_payment_total
        });
        submitError = error;
      }
      if (submitError) throw submitError;

      setFormMessage(editingProperty ? 'Listing updated and sent for admin review.' : 'Your property advert has been submitted for admin review.');
      formElement.reset();
      setShowAdvertForm(false);
      setEditingProperty(null);
      await loadDashboard();
    } catch (err) {
      setFormMessage(`${stage}: ${err.message || 'Could not submit your advert.'}`);
    } finally {
      setSubmitting(false);
    }
  }


  if (showEnquiries) {
    return (
      <main className="agent-dashboard">
        <header className="header">
          <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
          <div className="dashboard-actions">
            <button type="button" className="login" onClick={() => setShowEnquiries(false)}>Back to Dashboard</button>
            <button type="button" className="login" onClick={onLogout}>Logout</button>
          </div>
        </header>
        <section className="dashboard-welcome">
          <span className="eyebrow">CUSTOMER COMMUNICATION</span>
          <h1>Property Enquiries</h1>
          <p>Messages from customers interested in your property listings.</p>
        </section>
        <section className="dashboard-content">
          <section className="dashboard-panel">
            <h2>My Property Enquiries ({enquiries.length})</h2>
            <p>Messages from customers interested in your property listings.</p>
            {enquiries.length === 0 ? <p>No customer enquiries have been received for your properties yet.</p> : (
              <div className="dashboard-listings">
                {enquiries.map(enquiry => {
                  const property = properties.find(item => item.id === enquiry.property_id);
                  const phone = (enquiry.customer_phone || '').replace(/\D/g, '');
                  const whatsappPhone = phone.startsWith('0') ? '234' + phone.slice(1) : phone;
                  const whatsappLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent('Hello ' + enquiry.customer_name + ', I am contacting you about your property enquiry.')}`;
                  return (
                    <article className="dashboard-listing" key={enquiry.id}>
                      <div>
                        <strong>{enquiry.customer_name}</strong>
                        <p>Property: {property?.title || 'Property enquiry'}</p>
                        <p>Phone: {enquiry.customer_phone}</p>
                        <p>{enquiry.message}</p>
                        <small>Received: {new Date(enquiry.created_at).toLocaleString('en-NG')}</small>
                        <br />
                        <small>Status: {enquiry.status || 'new'}</small>
                        <div className="public-property-contact">
                          <a href={`tel:${enquiry.customer_phone}`}><Phone size={16} /> Call Customer</a>
                          {whatsappPhone && <a href={whatsappLink} target="_blank" rel="noreferrer">WhatsApp Customer</a>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </main>
    );
  }

  if (showHousingRequests) {
    return (
      <main className="agent-dashboard">
        <header className="header">
          <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
          <div className="dashboard-actions">
            <button type="button" className="login" onClick={() => setShowHousingRequests(false)}>Back to Dashboard</button>
            <button type="button" className="login" onClick={onLogout}>Logout</button>
          </div>
        </header>
        <section className="dashboard-welcome">
          <span className="eyebrow">SHARED CUSTOMER REQUESTS</span>
          <h1>Housing Requests</h1>
          <p>Review housing requests shared with all agents.</p>
        </section>
        <section className="dashboard-content">
          <section className="dashboard-panel">
            <h2>Housing Requests</h2>
            <p>These requests are visible to all agents.</p>
            {housingRequests.length === 0 ? <p>No housing requests have been received yet.</p> : (
              <div className="dashboard-listings">
                {housingRequests.map(request => (
                  <article className="dashboard-listing" key={request.id}>
                    <div>
                      <strong>{request.customer_name || 'Customer'}</strong>
                      <p>Location: {[request.area, request.city, request.state].filter(Boolean).join(', ') || 'Not specified'}</p>
                      <p>Budget: {request.budget || 'Not specified'}</p>
                      <p>Property type: {request.property_type || 'Not specified'}</p>
                      <p>Bedrooms: {request.bedrooms || 'Not specified'}</p>
                      <p>Phone: {request.customer_phone || 'Not provided'}</p>
                      <p>{request.description || ''}</p>
                      <small>Received: {request.created_at ? new Date(request.created_at).toLocaleString('en-NG') : ''}</small>
                      <br />
                      <small>Status: {request.status || 'new'}</small>
                      {request.customer_phone && (
                        <div className="public-property-contact">
                          <a href={`tel:${request.customer_phone}`}><Phone size={16} /> Call Customer</a>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    );
  }

  const myListingsToDisplay = properties.filter(property => listingStatusFilter === 'all' || property.status === listingStatusFilter);

  if (showMyListingsPage) {
    return (
      <main className="agent-dashboard">
        <header className="header">
          <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
          <div className="dashboard-actions">
            <button type="button" className="login" onClick={() => setShowMyListingsPage(false)}>Back to Dashboard</button>
            <button type="button" className="login" onClick={onLogout}>Logout</button>
          </div>
        </header>
        <section className="dashboard-welcome">
          <span className="eyebrow">PROPERTY MANAGEMENT</span>
          <h1>My Listings</h1>
          <p>Manage your property adverts and listings.</p>
        </section>
        <section className="dashboard-content">
          {loading ? <p>Loading your listings...</p> : (
            <>
              {error && <p className="portal-message">{error}</p>}
<section id="agent-property-listings" className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <span className="eyebrow">PROPERTY MANAGEMENT</span>
                  <h2>My Property Listings</h2>
                </div>
                <button
                  className="portal-submit"
                  type="button"
                  onClick={() => {
                    setFormMessage('');
                    setShowAdvertForm(!showAdvertForm);
                  }}
                >
                  {showAdvertForm ? 'Close Form' : 'Submit Property Advert'}
                  <ArrowRight size={17} />
                </button>
              </div>

              {formMessage && <p className="portal-message">{formMessage}</p>}

              {showAdvertForm && (
                <form
                  key={editingProperty?.id || "new-advert"}
                  className="advert-form"
                  onSubmit={handleAdvertSubmit}
                >
                  <h3>Property Information</h3>

                  <label>Property title *
                    <input name="title" required defaultValue={editingProperty?.title || ""} placeholder="e.g. Spacious 3 Bedroom Flat" />
                  </label>

                  <label>Property type *
                    <select name="property_type" required defaultValue={editingProperty?.property_type || ""}>
                      <option value="" disabled>Select property type</option>
                      <option>Self Contain</option>
                      <option>Room and Parlour</option>
                      <option>Mini Flat</option>
                      <option>2 Bedroom Flat</option>
                      <option>3 Bedroom Flat</option>
                      <option>4 Bedroom Flat</option>
                      <option>Duplex</option>
                      <option>Detached House</option>
                      <option>Commercial Property</option>
                      <option>Land</option>
                    </select>
                  </label>

                  <h3>Exact Property Location</h3>
                  <p className="form-hint">All four location fields are compulsory. Provide an accurate address tenants can use to locate the property.</p>

                  <label>State *
                    <input name="state" required defaultValue={editingProperty?.state || ""} placeholder="e.g. Delta State" />
                  </label>

                  <label>City / Town *
                    <input name="city" required defaultValue={editingProperty?.city || ""} placeholder="e.g. Warri" />
                  </label>

                  <label>Area / Neighbourhood *
                    <input name="area" required defaultValue={editingProperty?.area || ""} placeholder="e.g. Ekpan" />
                  </label>

                  <label>Full house address *
                    <textarea name="address" required defaultValue={editingProperty?.address || ""} rows="3" placeholder="Enter street name, house number and other identifying details" />
                  </label>

                  <h3>Rent and Initial Payment</h3>
                  <label>Annual rent (12 months) in naira *
                    <input name="rent_amount" type="number" min="1" step="0.01" required defaultValue={editingProperty?.rent_amount ?? ""} placeholder="e.g. 1200000" />
                  </label>

                  <label>First Payment (₦) *
                    <input name="first_payment_total" type="number" min="1" step="0.01" required defaultValue={editingProperty?.first_payment_total ?? editingProperty?.rent_amount ?? ""} placeholder="Enter the first payment amount" />
                  </label>

                  <label>Description
                    <textarea name="description" defaultValue={editingProperty?.description || ""} rows="5" placeholder="Describe the property, facilities, condition and nearby landmarks." />
                  </label>

                  <label>Contact phone number *
                    <input name="contact_phone" type="tel" required defaultValue={editingProperty?.contact_phone || ""} placeholder="Agent's phone number" />
                  </label>

                  <h3>Property Photos</h3>
                  <p className="form-hint">Photos are optional. Upload up to 8 clear photos (JPG, PNG or WebP; maximum 5 MB each). A default house photo appears when none are uploaded.</p>
                  <label>Choose property photos (optional)
                    <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
                  </label>

                  <button className="portal-submit advert-submit" type="submit" disabled={submitting}>
                    {submitting ? 'Saving advert...' : editingProperty ? 'Save Listing Changes' : 'Submit Advert for Admin Review'}
                  </button>
                </form>
              )}

              {promotionMessage && <p role="status">{promotionMessage}</p>}
          {myListingsToDisplay.length === 0 ? (
                <p>{listingStatusFilter === "all" ? "You have not submitted any property adverts yet." : `No ${listingStatusFilter} listings found.`}</p>
              ) : (
                <div className="dashboard-listings">
                  {myListingsToDisplay.map(property => (
                    <article className="dashboard-listing" key={property.id}>
                      <div>
                        <strong>{property.title}</strong>
                        <p>{property.area}, {property.city}, {property.state}</p>
                        <p>{property.address}</p>
                        <small>Annual rent: ₦{Number(property.rent_amount).toLocaleString('en-NG')}</small>
                        <br />
                        <small>First payment: ₦{Number(property.first_payment_total ?? property.rent_amount).toLocaleString('en-NG')}</small>
                      </div>
                      {(property.photo_urls || []).length > 0 && (
                        <div className="property-photo-gallery">
                          {(property.photo_urls || []).map((url, index) => (
                            <a href={url} target="_blank" rel="noreferrer" key={index}>
                              <img src={url} alt={`${property.title} photo ${index + 1}`} loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}
                      {property.status === 'approved' && (
            <div className="property-promotion-controls">
              {promotions.some(item => item.property_id === property.id && new Date(item.expires_at) > new Date()) && (
                <p>Featured until: {new Date(promotions.find(item => item.property_id === property.id).expires_at).toLocaleString()}</p>
              )}
              <label>
                Promotion days
                <input type="number" min="1" max="365"
                  value={promotionDays[property.id] || 1}
                  onChange={e => setPromotionDays(old => ({ ...old, [property.id]: e.target.value }))}
                />
              </label>
              <p>Cost: {Number(promotionDays[property.id] || 1) * 200} coins</p>
              <button type="button" className="portal-submit"
                disabled={promotingProperty === property.id}
                onClick={() => handlePromoteProperty(property.id)}>
                {promotingProperty === property.id ? 'Activating...' : 'Promote this property'}
              </button>
            </div>
          )}
          <div className="availability-control" style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            margin: '12px 0',
            borderRadius: '8px',
            background: '#f3f4f6'
          }}>
            <span>Availability: {property.availability_status || 'available'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={(property.availability_status || 'available') === 'available'}
              onClick={() => handleAvailabilityChange(
                property.id,
                property.availability_status === 'available' ? 'unavailable' : 'available'
              )}
              style={{
                padding: '9px 16px',
                borderRadius: '24px',
                border: 'none',
                color: '#fff',
                background: (property.availability_status || 'available') === 'available' ? '#16803c' : '#777',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {(property.availability_status || 'available') === 'available' ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="portal-submit"
              onClick={() => handleAvailabilityChange(property.id, 'rented')}
            >
              Mark as Rented
            </button>
          </div>

          <button type="button" className="portal-submit"
            onClick={() => handleEditProperty(property)}>
            Edit Listing
          </button>
          <button type="button" className="portal-submit"
            onClick={() => handleDeleteProperty(property)}>
            Delete Listing
          </button>
          <span className={'listing-status ' + property.status}>
                        {property.status}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
            </>
          )}
        </section>
      </main>
    );
  }

  if (showVerificationPage) {
    return (
      <main className="agent-dashboard">
        <header className="header">
          <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
          <div className="dashboard-actions">
            <button type="button" className="login" onClick={() => setShowVerificationPage(false)}>Back to Dashboard</button>
            <button type="button" className="login" onClick={onLogout}>Logout</button>
          </div>
        </header>
        <section className="dashboard-welcome">
          <span className="eyebrow">ACCOUNT SECURITY</span>
          <h1>Agent Verification</h1>
          <p>Submit your identity documents securely for administrator review.</p>
        </section>
        <section className="dashboard-content">
          <section className="dashboard-panel">
            <span className="eyebrow">IDENTITY CHECK</span>
            <h2>Verify Your Identity</h2>
            {verification && (
              <>
                <p>Government ID: <strong>{verification.government_id_type}</strong></p>
                <p>Verification status: <strong>{verification.status.toUpperCase()}</strong></p>
                {verification.admin_note && <p>Administrator note: {verification.admin_note}</p>}
                {verification.submitted_at && <p>Submitted: {new Date(verification.submitted_at).toLocaleString('en-NG')}</p>}
              </>
            )}
            {verificationMessage && <p className="portal-message" role="status">{verificationMessage}</p>}
            {(!verification || verification.status === 'rejected') ? (
              <form className="advert-form" onSubmit={submitAgentVerification}>
                <label>Government ID type
                  <select value={governmentIdType} onChange={e => setGovernmentIdType(e.target.value)} required>
                    <option>National ID</option>
                    <option>International Passport</option>
                    <option>Drivers License</option>
                    <option>Voters Card</option>
                  </select>
                </label>
                <label>Government ID document (PDF, JPG, PNG or WebP; max 5 MB)
                  <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e => setGovernmentIdFile(e.target.files?.[0] || null)} required />
                </label>
                <label>Clear selfie photo (JPG, PNG or WebP; max 5 MB)
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setSelfieFile(e.target.files?.[0] || null)} required />
                </label>
                <button type="submit" className="portal-submit" disabled={verificationSubmitting}>
                  {verificationSubmitting ? 'Submitting...' : 'Submit for Verification'}
                </button>
              </form>
            ) : (
              <p>Your documents are already submitted. You cannot submit again unless your verification is rejected.</p>
            )}
          </section>
        </section>

        <footer className="agent-dashboard-footer">
          <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
          <p>Helping people find a place to call home.</p>
          <small>© {new Date().getFullYear()} Kyrios Homes For Rent. All rights reserved.</small>
        </footer>
</main>
    );
  }

  if (showBuyPoints) {
    return (
      <main className="agent-dashboard agent-dashboard-agent">
        <header className="header">
          <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
          <div className="dashboard-actions">
            <button className="login" type="button" onClick={() => setShowBuyPoints(false)}>Back to Dashboard</button>
            <button className="login" type="button" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <section className="dashboard-welcome">
          <span className="eyebrow">ACCOUNT POINTS</span>
          <h1>Available Points</h1>
          <p>Manage your points balance and purchase points for premium property adverts.</p>
        </section>

        <section className="dashboard-content">
          <section className="dashboard-panel">
            <span className="eyebrow">YOUR POINTS BALANCE</span>
            <h2>{availableForAdverts.toLocaleString()} Points Available</h2>
            <p>Points are used to publish premium property adverts on Kyrios Homes For Rent. You need sufficient points to submit new premium adverts.</p>

            <h2>How to Buy Points</h2>
            <ol>
              <li>Select OPay Transfer or MTN Recharge Card.</li>
              <li>Enter your payment amount. The minimum payment is ₦500.</li>
              <li>Follow the instructions for your selected payment method.</li>
              <li>Submit your payment details and required proof.</li>
              <li>Wait for administrator verification. Points are credited after approval.</li>
            </ol>

            <h2>Buy Points</h2>
            <p>Choose your payment method and submit your payment details for verification.</p>

            {purchaseMessage && <p className="portal-message" role="status">{purchaseMessage}</p>}

            <form className="advert-form" onSubmit={handlePointPurchaseSubmit}>
              <label>Payment method
                <select name="payment_method" value={purchaseMethod}
                  onChange={e => setPurchaseMethod(e.target.value)} required>
                  <option value="MTN Recharge Card">MTN Recharge Card</option>
                  <option value="Bank Transfer">OPay Transfer</option>
                </select>
              </label>

              <label>Amount paid (₦)
                <input name="amount_paid" type="number" min="500" step="1"
                  value={purchaseAmount}
                  onChange={e => setPurchaseAmount(e.target.value)} required />
              </label>
              <p>
                Estimated coins: <strong>
                  {Math.floor((Number(purchaseAmount) || 0) *
                    (purchaseMethod === 'Bank Transfer' ? 350 : 300) / 500).toLocaleString()}
                </strong>
              </p>
              <small>Minimum payment ₦500. Coins are confirmed after admin approval.</small>

              {purchaseMethod === 'Bank Transfer' ? (
                <>
                  <div className="dashboard-panel">
                    <span className="eyebrow">OPAY ACCOUNT DETAILS</span>
                    <h3>7068963439</h3>
                    <p>Account name: Kerimu Thankgod</p>
                    <p>Make your transfer and upload your payment receipt below.</p>
                  </div>
                  <label>Your name
                    <input name="sender_name" type="text" required />
                  </label>
                  <label>Your phone number
                    <input name="sender_phone" type="tel" required />
                  </label>
                  <label>Transfer reference
                    <input name="transfer_reference" type="text" required />
                  </label>
                  <label>Payment receipt
                    <input name="proof" type="file" accept="image/*,.pdf" required />
                  </label>
                </>
              ) : (
                <>
                  <label>MTN recharge PIN
                    <input name="recharge_pin" type="text" inputMode="numeric" autoComplete="off" required />
                  </label>
                  <label>MTN serial number
                    <input name="serial_number" type="text" />
                  </label>
                  <label>Your phone number
                    <input name="sender_phone" type="tel" />
                  </label>
                </>
              )}

              <button className="portal-submit" type="submit" disabled={purchaseSubmitting}>
                {purchaseSubmitting ? 'Submitting...' : 'Send for Admin Verification'}
              </button>
            </form>

            <h2>Your Purchase Requests</h2>
            {purchaseRequests.length === 0 ? <p>No purchase requests yet.</p> : (
              <div className="dashboard-listings">
                {purchaseRequests.map(request => (
                  <article className="dashboard-listing" key={request.id}>
                    <div>
                      <strong>{request.payment_method === 'Bank Transfer' ? 'OPay Transfer' : request.payment_method}</strong>
                      <p>Amount paid: ₦{Number(request.amount_paid).toLocaleString('en-NG')}</p>
                      {request.status === 'approved' && <p>Points awarded: {request.points_awarded}</p>}
                      {request.admin_note && <small>Admin note: {request.admin_note}</small>}
                      <small>{new Date(request.created_at).toLocaleString()}</small>
                    </div>
                    <span className={'listing-status ' + request.status}>{request.status}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="agent-dashboard">
      <header className="header">
        <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
        <div className="dashboard-actions"><button className="login" onClick={onHome}>Home</button><button className="login" onClick={onLogout}>Logout</button></div>
      </header>

      <section className="dashboard-welcome">
        <span className="eyebrow">AGENT CONTROL PANEL</span>
        <h1>Welcome, {profile?.full_name || user.email || 'Agent'} {verification?.status === 'approved' && <span className="agent-verified-badge" title="Verified Agent" aria-label="Verified Agent">✓</span>}</h1>
        <p>Manage your property adverts and account activity.</p>
      </section>

            <button
        type="button"
        className="dashboard-stat dashboard-stat-clickable add-property-dashboard-button"
        onClick={() => {
          setEditingProperty(null);
          setFormMessage('');
          setListingStatusFilter('all');
          setShowMyListingsPage(true);
          setShowAdvertForm(true);
        }}
      >
        <span>Add Property</span>
        <strong>+</strong>
        <small>Submit a new property listing ↗</small>
      </button>

      <div className="dashboard-stats">
              <button
                type="button"
                className="dashboard-stat dashboard-stat-clickable"
                onClick={() => setShowBuyPoints(true)}
                aria-label="Open Available Points and Buy Points"
              >
                <span>Available points</span>
                <strong>{availableForAdverts}</strong>
                <small>Ready for new adverts · View and buy points ↗</small>
              </button>
              <button type="button" className="dashboard-stat dashboard-stat-clickable" onClick={() => { setListingStatusFilter("all"); setShowMyListingsPage(true); }}><span>Total listings</span><strong>{properties.length}</strong><small>Your submitted properties · View listings ↗</small></button>
              <button type="button" className="dashboard-stat dashboard-stat-clickable" onClick={() => { setListingStatusFilter("approved"); setShowMyListingsPage(true); }}><span>Approved listings</span><strong>{approved}</strong><small>Published properties · View listings ↗</small></button>
              <button type="button" className="dashboard-stat dashboard-stat-clickable" onClick={() => { setListingStatusFilter("pending"); setShowMyListingsPage(true); }}><span>Pending review</span><strong>{pending}</strong><small>Awaiting admin confirmation · View listings ↗</small></button>
            </div>



    <section className="dashboard-content">
        {loading ? <p>Loading your dashboard...</p> : (
          <>
            {error && <p className="portal-message">{error}</p>}
      {newCustomerRequests.length > 0 && (
        <section id="agent-new-requests" className="dashboard-panel admin-new-requests">
          <span className="eyebrow">NEW CUSTOMER ACTIVITY</span>
          <h2>New Customer Requests ({newCustomerRequests.length})</h2>
          <p>Only enquiries for your properties and shared housing requests appear here.</p>
          <div className="admin-new-request-list">
            {newCustomerRequests.map(request => (
              <button
                type="button"
                className="admin-new-request"
                key={request.key}
                onClick={() => openAgentRequest(request)}
              >
                <span className="admin-new-request-type">{request.typeLabel}</span>
                <strong>{request.customer_name || 'Customer'}</strong>
                <small>{request.propertyTitle} · {request.customer_phone || 'No phone provided'}</small>
                <small>{request.created_at ? new Date(request.created_at).toLocaleString('en-NG') : ''}</small>
              </button>
            ))}
          </div>
        </section>
      )}




            <div className="dashboard-section-grid">
  <button type="button" className="dashboard-stat dashboard-stat-clickable" onClick={() => setShowEnquiries(true)}>
    <span>Property Enquiries</span>
    <strong>{enquiryCount ?? enquiries.length}</strong>
    <small>View customer messages and contact details ↗</small>
  </button>
  <button type="button" className="dashboard-stat dashboard-stat-clickable" onClick={() => setShowHousingRequests(true)}>
    <span>Housing Requests</span>
    <strong>{housingRequests.length}</strong>
    <small>View shared customer housing requests ↗</small>
  </button>


<button
  type="button"
  className="dashboard-stat dashboard-stat-clickable"
  onClick={() => setShowVerificationPage(true)}
>
  <span>Identity Verification</span>
  <strong>
    {verification?.status?.toLowerCase() === 'approved' ? (
      <>YOU ARE APPROVED <span title="Verified account" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'19px',height:'19px',borderRadius:'50%',background:'#1877f2',color:'#fff',fontSize:'13px',fontWeight:800,marginLeft:'5px'}}>✓</span></>
    ) : verification ? verification.status.toUpperCase() : 'NOT VERIFIED'}
  </strong>
  <small>{verification ? 'View your verification details' : 'Verify your account'} ↗</small>
</button>

<button
  type="button"
  className="dashboard-stat dashboard-stat-clickable"
  onClick={() => setShowMyListingsPage(true)}
>
  <span>My Listings</span>
  <strong>{properties.length}</strong>
  <small>Manage your property adverts ↗</small>
</button>
</div>

          </>
        )}
      </section>
    <footer className="dashboard-footer">
      <strong>Kyrios Homes For Rent</strong>
      <span>© {new Date().getFullYear()} Kyrios Homes For Rent. All rights reserved.</span>
    </footer>
    </main>
  );
}



function AdminDashboard({ user, onLogout, onHome, backHandlerRef, developerMode, onToggleDeveloperMode, logoName, logoSubtitle, logoInitials }) {
  const [properties, setProperties] = useState([]);
  const [agents, setAgents] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [housingRequests, setHousingRequests] = useState([]);
  const [viewedRequestKeys, setViewedRequestKeys] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('adminViewedCustomerRequests') || '[]');
    } catch {
      return [];
    }
  });
  const [requestTab, setRequestTab] = useState('enquiries');
  const [updatingRequest, setUpdatingRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(null);
  const [tab, setTab] = useState('pending');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [activeAdminSection, setActiveAdminSection] = useState('overview');
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [mtnSubmissions, setMtnSubmissions] = useState([]);
  const [awardPoints, setAwardPoints] = useState({});
  const [purchaseNotes, setPurchaseNotes] = useState({});
  const [reviewingPurchase, setReviewingPurchase] = useState(null);
  const [verifications, setVerifications] = useState([]);
  const [verificationNotes, setVerificationNotes] = useState({});
  const [reviewingVerification, setReviewingVerification] = useState(null);

  useEffect(() => {
    if (!backHandlerRef) return;
    backHandlerRef.current = () => {
      if (reviewingVerification) { setReviewingVerification(null); return; }
      if (reviewingPurchase) { setReviewingPurchase(null); return; }
      if (reviewing) { setReviewing(null); return; }
      if (activeAdminSection === 'properties' && availabilityFilter !== 'all') {
        setAvailabilityFilter('all'); return;
      }
      if (activeAdminSection === 'properties' && tab !== 'pending') {
        setTab('pending'); return;
      }
      if (requestTab !== 'enquiries') { setRequestTab('enquiries'); return; }
      if (activeAdminSection !== 'overview') { setActiveAdminSection('overview'); return; }
      onHome?.();
    };
    return () => { backHandlerRef.current = null; };
  }, [backHandlerRef, reviewingVerification, reviewingPurchase, reviewing,
      activeAdminSection, availabilityFilter, tab, requestTab, onHome]);



  async function loadAdminData() {
    setLoading(true);
    setError('');

    const [propertyResult, profileResult, pointResult, purchaseResult, mtnResult, verificationResult] = await Promise.all([
      supabase.from('properties')
        .select('id, agent_id, title, property_type, state, city, area, address, rent_amount, agreement_fee, agency_fee, caution_fee, first_payment_total, bedrooms, bathrooms, description, contact_phone, photo_urls, status, availability_status, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('profiles')
        .select('id, email, full_name, phone, role, is_blocked'),
      supabase.from('agent_points')
        .select('user_id, balance'),
      supabase.from('point_purchase_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('mtn_recharge_submissions').select('request_id, recharge_pin, serial_number'),
      supabase.from('agent_verifications').select('*').order('submitted_at', { ascending: false })
    ]);

    if (propertyResult.error || profileResult.error || pointResult.error || purchaseResult.error || mtnResult.error) {
      setError('Some admin information could not be loaded. Check database permissions and refresh.');
    }

    setProperties(propertyResult.data || []);
    setAgents((profileResult.data || []).map(agent => ({
      ...agent,
      points: pointResult.data?.find(p => p.user_id === agent.id)?.balance ?? 0
    })));
    setPurchaseRequests(purchaseResult.data || []);
    setMtnSubmissions(mtnResult.data || []);
    setVerifications(verificationResult.data || []);
    setLoading(false);
  }

  async function openVerificationFile(path) {
    const { data, error } = await supabase.storage
      .from('agent-verification')
      .createSignedUrl(path, 300);
    if (error) {
      setError(error.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function reviewVerification(record, status) {
    setReviewingVerification(record.agent_id);
    setError('');
    const { error } = await supabase.rpc('review_agent_verification', {
      p_agent_id: record.agent_id,
      p_status: status,
      p_admin_note: verificationNotes[record.id] || null
    });
    if (error) {
      setError(error.message);
    } else {
      setError('Verification ' + status + ' successfully.');
      await loadAdminData();
    }
    setReviewingVerification(null);
  }

  async function manageAgent(agent, action) {
    const labels = {
      block: 'block this agent',
      unblock: 'unblock this agent',
      promote: 'promote this agent to administrator',
      demote: 'remove administrator privileges from this account'
    };
    if (!window.confirm('Are you sure you want to ' + labels[action] + '?')) return;

    const { error } = await supabase.rpc('manage_agent_account', {
      p_user_id: agent.id,
      p_action: action
    });

    if (error) {
      setError(error.message);
      return;
    }

    setError('Account updated successfully.');
    await loadAdminData();
  }

  useEffect(() => {
    loadAdminData();
    loadRequests();
  }, []);


  async function approvePointPurchase(request) {
    const rate = request.payment_method === 'Bank Transfer' ? 350 : 300;
    const pointsToAward = Math.floor(Number(request.amount_paid) * rate / 500);

    if (Number(request.amount_paid) < 500 || pointsToAward <= 0) {
      setError('This request does not meet the ₦500 minimum payment.');
      return;
    }

    setReviewingPurchase(request.id);
    setError('');
    const { error: approvalError } = await supabase.rpc('approve_point_purchase', {
      p_request_id: request.id,
      p_points: pointsToAward,
      p_admin_note: purchaseNotes[request.id] || null
    });
    if (approvalError) setError(approvalError.message);
    else await loadAdminData();
    setReviewingPurchase(null);
  }

  async function rejectPointPurchase(request) {
    if (!window.confirm('Reject this point purchase request?')) return;
    setReviewingPurchase(request.id);
    setError('');
    const { error: rejectError } = await supabase
      .from('point_purchase_requests')
      .update({
        status: 'rejected',
        admin_note: purchaseNotes[request.id] || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', request.id)
      .eq('status', 'pending');
    if (rejectError) setError(rejectError.message);
    else await loadAdminData();
    setReviewingPurchase(null);
  }

  async function loadRequests() {
    const [enquiryResult, housingResult] = await Promise.all([
      supabase.from('enquiries')
        .select('id, property_id, agent_id, customer_name, customer_phone, message, status, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('housing_requests')
        .select('id, customer_name, customer_phone, state, city, area, budget, property_type, bedrooms, description, status, created_at')
        .order('created_at', { ascending: false })
    ]);

    if (enquiryResult.error || housingResult.error) {
      setError('Some customer requests could not be loaded. Check database permissions and refresh.');
      return;
    }

    setEnquiries(enquiryResult.data || []);
    setHousingRequests(housingResult.data || []);
  }

  async function updateRequestStatus(table, id, status) {
    setUpdatingRequest(id);
    setError('');

    const { error: updateError } = await supabase
      .from(table)
      .update({ status })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadRequests();
    }

    setUpdatingRequest(null);
  }

  function markCustomerRequestViewed(request) {
    const next = [...new Set([...viewedRequestKeys, request.key])];
    setViewedRequestKeys(next);
    try {
      localStorage.setItem('adminViewedCustomerRequests', JSON.stringify(next));
    } catch {}
    setRequestTab(request.requestTab);
    setActiveAdminSection('requests');
  }

  async function reviewProperty(id, decision) {
    const action = decision === 'approved' ? 'approve' : 'reject';
    if (!window.confirm(`Are you sure you want to ${action} this property advert?`)) return;

    setReviewing(id);
    setError('');

    const { error: reviewError } = await supabase.rpc('admin_review_property', {
      p_property_id: id,
      p_decision: decision
    });

    if (reviewError) {
      setError(reviewError.message);
    } else {
      await loadAdminData();
    }

    setReviewing(null);
  }

  const pending = properties.filter(p => p.status === 'pending');
  const approved = properties.filter(p => p.status === 'approved');
  const rejected = properties.filter(p => p.status === 'rejected');

  const displayed = tab === 'all'
    ? properties
    : properties.filter(p => p.status === tab);

  const availabilityFiltered = displayed.filter(property =>
    availabilityFilter === 'all' ||
    (property.availability_status || 'available') === availabilityFilter
  );

  const newCustomerRequests = [
    ...enquiries.filter(r => !r.status || r.status === 'new').map(r => ({
      ...r, key: 'enquiry-' + r.id, requestTab: 'enquiries',
      typeLabel: 'Property enquiry'
    })),
    ...housingRequests.filter(r => !r.status || r.status === 'new').map(r => ({
      ...r, key: 'housing-' + r.id, requestTab: 'housing',
      typeLabel: 'Housing request'
    }))
  ]
    .filter(r => !viewedRequestKeys.includes(r.key))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <main className="agent-dashboard">
      <header className="header">
        <BrandLogo name={logoName} subtitle={logoSubtitle} initials={logoInitials} />
        <div className="dashboard-actions"><button
            type="button"
            className="login"
            aria-pressed={developerMode}
            onClick={onToggleDeveloperMode}
          >
            {developerMode ? 'Exit Developer Mode' : 'Enter Developer Mode'}
          </button>
          <button className="login" onClick={onHome}>Home</button><button className="login" onClick={onLogout}>Logout</button></div>
      </header>

      <section className="dashboard-welcome admin-welcome">
        <span className="eyebrow">ADMINISTRATOR CONTROL PANEL</span>
        <h1>Welcome, Mr Vessel</h1>
        <p>Manage property adverts, review submissions and monitor agents.</p>
      </section>

      <section className="dashboard-content">
        {error && <p className="portal-message">{error}</p>}

        {activeAdminSection === 'overview' && (
          <>
<div className="dashboard-stats">
          <article className="dashboard-stat">
            <span>Total properties</span>
            <strong>{properties.length}</strong>
            <small>All submitted adverts</small>
          </article>
          <article className="dashboard-stat">
            <span>Pending review</span>
            <strong>{pending.length}</strong>
            <small>Awaiting your decision</small>
          </article>
          <article className="dashboard-stat">
            <span>Approved</span>
            <strong>{approved.length}</strong>
            <small>Published adverts</small>
          </article>
          <article className="dashboard-stat">
            <span>Rejected</span>
            <strong>{rejected.length}</strong>
            <small>Not approved</small>
          </article>
        </div>
          </>
        )}
        <section className="dashboard-panel">
          <span className="eyebrow">ADMIN MENU</span>
          <h2>Management Sections</h2>
          <div className="admin-tabs">
            {[
              ['overview', 'Overview'],
              ['properties', 'Property Management'],
              ['requests', 'Customer Requests'],
              ['payments', 'Payment Verification'],
              ['agents', 'Agent Accounts'],
              ['verifications', 'Agent Verification']
            ].map(([value, label]) => (
              <button
                key={value}
                className={activeAdminSection === value ? 'admin-tab active' : 'admin-tab'}
                onClick={() => setActiveAdminSection(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>


        {activeAdminSection === 'properties' && (
          <>
<section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="eyebrow">PROPERTY MODERATION</span>
              <h2>Property Advert Management</h2>
            </div>
            <button className="portal-submit" onClick={loadAdminData} disabled={loading}>
              Refresh
            </button>
          </div>

          <div className="admin-tabs">
            {[
              ['pending', 'Pending'],
              ['approved', 'Approved'],
              ['rejected', 'Rejected'],
              ['all', 'All Properties']
            ].map(([value, label]) => (
              <button
                key={value}
                className={tab === value ? 'admin-tab active' : 'admin-tab'}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="admin-tabs">
            {[
              ['all', 'All Availability'],
              ['available', 'Available'],
              ['rented', 'Rented'],
              ['unavailable', 'Unavailable']
            ].map(([value, label]) => (
              <button
                key={value}
                className={availabilityFilter === value ? 'admin-tab active' : 'admin-tab'}
                onClick={() => setAvailabilityFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? <p>Loading property adverts...</p> : availabilityFiltered.length === 0 ? (
            <p>No properties in this category yet.</p>
          ) : (
            <div className="admin-properties">
              {availabilityFiltered.map(property => (
                <article className="admin-property" key={property.id}>
                  <div className="admin-property-heading">
                    <div>
                      <strong>{property.title}</strong>
                      <span className={'listing-status ' + property.status}>
                        {property.status}
                      </span>
                      <span style={{
                        display: 'inline-block',
                        marginTop: '6px',
                        padding: '5px 9px',
                        borderRadius: '5px',
                        background: property.availability_status === 'rented' ? '#b42318' : property.availability_status === 'unavailable' ? '#777' : '#16803c',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        Availability: {(property.availability_status || 'available').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <p><strong>Location:</strong> {property.address}, {property.area}, {property.city}, {property.state}</p>
                  <p><strong>Type:</strong> {property.property_type}</p>
                  <p><strong>Bedrooms:</strong> {property.bedrooms} | <strong>Bathrooms:</strong> {property.bathrooms}</p>
                  <p><strong>Annual rent:</strong> ₦{Number(property.rent_amount).toLocaleString('en-NG')}</p>
                  <p><strong>Agreement:</strong> ₦{Number(property.agreement_fee).toLocaleString('en-NG')}</p>
                  <p><strong>Agency:</strong> ₦{Number(property.agency_fee).toLocaleString('en-NG')}</p>
                  <p><strong>Caution:</strong> ₦{Number(property.caution_fee).toLocaleString('en-NG')}</p>
                  <p><strong>First payment:</strong> ₦{Number(property.first_payment_total).toLocaleString('en-NG')}</p>
                  <p><strong>Agent phone:</strong> {property.contact_phone}</p>
                  <p>{property.description}</p>

                  <div className="admin-photo-grid">
                    {(property.photo_urls || []).map((url, index) => (
                      <a href={url} target="_blank" rel="noreferrer" key={index}>
                        <img src={url} alt={`${property.title} photo ${index + 1}`} />
                      </a>
                    ))}
                  </div>

                  {property.status === 'pending' && (
                    <div className="admin-review-actions">
                      <button
                        className="admin-approve"
                        disabled={reviewing === property.id}
                        onClick={() => reviewProperty(property.id, 'approved')}
                      >
                        {reviewing === property.id ? 'Processing...' : 'Approve Advert'}
                      </button>
                      <button
                        className="admin-reject"
                        disabled={reviewing === property.id}
                        onClick={() => reviewProperty(property.id, 'rejected')}
                      >
                        Reject Advert
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="admin-reject"
                    onClick={async () => {
                      if (!window.confirm(`Permanently delete ${property.title}?`)) return;
                      const { error } = await supabase.from('properties').delete().eq('id', property.id);
                      if (error) {
                        alert(error.message);
                        return;
                      }
                      await loadAdminData();
                    }}
                  >
                    Delete Listing
                  </button>
</article>
              ))}
            </div>
          )}
        </section>


          </>
        )}

{activeAdminSection === 'requests' && (
          <>
<section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="eyebrow">CUSTOMER COMMUNICATION</span>
              <h2>Admin Request Inbox</h2>
            </div>
            <button className="portal-submit" onClick={loadRequests}>
              Refresh Requests
            </button>
          </div>

          <div className="admin-tabs">
            <button
              className={requestTab === 'enquiries' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setRequestTab('enquiries')}
            >
              Property Enquiries ({enquiries.length})
            </button>
            <button
              className={requestTab === 'housing' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setRequestTab('housing')}
            >
              Housing Requests ({housingRequests.length})
            </button>
          </div>

          {requestTab === 'enquiries' ? (
            enquiries.length === 0 ? (
              <p>No property enquiries received yet.</p>
            ) : (
              <div className="dashboard-listings">
                {enquiries.map(request => {
                  const property = properties.find(item => item.id === request.property_id);
                  const phone = (request.customer_phone || '').replace(/\\D/g, '');
                  const whatsapp = phone.startsWith('0') ? '234' + phone.slice(1) : phone;

                  return (
                    <article className="dashboard-listing" key={request.id}>
                      <div>
                        <strong>{request.customer_name || 'Customer'}</strong>
                        <p>Property: {property?.title || 'Property no longer available'}</p>
                        <p>Phone: {request.customer_phone || 'Not provided'}</p>
                        <p>{request.message || 'No message provided.'}</p>
                        <small>{request.created_at ? new Date(request.created_at).toLocaleString() : ''}</small>
                        <p><span className={'listing-status ' + (request.status || 'new')}>{request.status || 'new'}</span></p>
                        <div className="dashboard-actions">
                          {request.customer_phone && (
                            <>
                              <a className="login" href={`tel:${request.customer_phone}`}>Call</a>
                              <a className="login" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">WhatsApp</a>
                            </>
                          )}
                          {request.status !== 'contacted' && request.status !== 'resolved' && (
                            <button className="login" disabled={updatingRequest === request.id}
                              onClick={() => updateRequestStatus('enquiries', request.id, 'contacted')}>
                              Mark Contacted
                            </button>
                          )}
                          {request.status !== 'resolved' && (
                            <button className="login" disabled={updatingRequest === request.id}
                              onClick={() => updateRequestStatus('enquiries', request.id, 'resolved')}>
                              Mark Resolved
                            </button>
                          )}
                          {request.status === 'resolved' && (
                            <button className="login" disabled={updatingRequest === request.id}
                              onClick={() => updateRequestStatus('enquiries', request.id, 'new')}>
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : (
            housingRequests.length === 0 ? (
              <p>No general housing requests received yet.</p>
            ) : (
              <div className="dashboard-listings">
                {housingRequests.map(request => {
                  const phone = (request.customer_phone || '').replace(/\\D/g, '');
                  const whatsapp = phone.startsWith('0') ? '234' + phone.slice(1) : phone;

                  return (
                    <article className="dashboard-listing" key={request.id}>
                      <div>
                        <strong>{request.customer_name || 'Customer'}</strong>
                        <p>Location: {[request.area, request.city, request.state].filter(Boolean).join(', ') || 'Not specified'}</p>
                        <p>Budget: ₦{Number(request.budget || 0).toLocaleString('en-NG')}</p>
                        <p>Property type: {request.property_type || 'Not specified'}</p>
                        <p>Bedrooms: {request.bedrooms ?? 'Not specified'}</p>
                        <p>Phone: {request.customer_phone || 'Not provided'}</p>
                        <p>{request.description || 'No additional details.'}</p>
                        <small>{request.created_at ? new Date(request.created_at).toLocaleString() : ''}</small>
                        <p><span className={'listing-status ' + (request.status || 'new')}>{request.status || 'new'}</span></p>
                        <div className="dashboard-actions">
                          {request.customer_phone && (
                            <>
                              <a className="login" href={`tel:${request.customer_phone}`}>Call</a>
                              <a className="login" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">WhatsApp</a>
                            </>
                          )}
                          {request.status !== 'contacted' && request.status !== 'resolved' && (
                            <button className="login" disabled={updatingRequest === request.id}
                              onClick={() => updateRequestStatus('housing_requests', request.id, 'contacted')}>
                              Mark Contacted
                            </button>
                          )}
                          {request.status !== 'resolved' && (
                            <button className="login" disabled={updatingRequest === request.id}
                              onClick={() => updateRequestStatus('housing_requests', request.id, 'resolved')}>
                              Mark Resolved
                            </button>
                          )}
                          {request.status === 'resolved' && (
                            <button className="login" disabled={updatingRequest === request.id}
                              onClick={() => updateRequestStatus('housing_requests', request.id, 'new')}>
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          )}
        </section>



          </>
        )}

{activeAdminSection === 'payments' && (
          <>
<section className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <span className="eyebrow">PAYMENT VERIFICATION</span>
                <h2>Point Purchase Requests</h2>
              </div>
              <button className="portal-submit" type="button" onClick={loadAdminData}>Refresh</button>
            </div>
            {purchaseRequests.filter(request => request.status === 'pending').length === 0 ? (
              <p>No pending point purchase requests.</p>
            ) : (
              <div className="dashboard-listings">
                {purchaseRequests.filter(request => request.status === 'pending').map(request => {
                  const agent = agents.find(item => item.id === request.agent_id);
                  const mtn = mtnSubmissions.find(item => item.request_id === request.id);
                  return (
                    <article className="dashboard-listing" key={request.id}>
                      <div>
                        <strong>{agent?.full_name || 'Agent'}</strong>
                        <p>{agent?.email || request.agent_id}</p>
                        <p>Method: {request.payment_method === 'Bank Transfer' ? 'OPay Transfer' : request.payment_method}</p>
                        <p>Amount paid: ₦{Number(request.amount_paid).toLocaleString('en-NG')}</p>
                        <p>Coins to award: <strong>
                          {Math.floor(Number(request.amount_paid) *
                            (request.payment_method === 'Bank Transfer' ? 350 : 300) / 500).toLocaleString()}
                        </strong></p>
                        {request.sender_phone && <p>Phone: {request.sender_phone}</p>}
                        {request.sender_name && <p>Sender: {request.sender_name}</p>}
                        {request.bank_name && <p>Bank: {request.bank_name}</p>}
                        {request.transfer_reference && <p>Reference: {request.transfer_reference}</p>}
                        {mtn && <p>MTN PIN: {mtn.recharge_pin}{mtn.serial_number ? ` | Serial: ${mtn.serial_number}` : ''}</p>}
                        {request.proof_path && (
                          <button type="button" className="login" onClick={async () => {
                            const { data, error: proofError } = await supabase.storage
                              .from('point-payment-proofs')
                              .createSignedUrl(request.proof_path, 300);
                            if (proofError) setError(proofError.message);
                            else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                          }}>View Transfer Receipt</button>
                        )}
                        <p><small>Submitted: {new Date(request.created_at).toLocaleString()}</small></p>
                      </div>
                      <div className="advert-form">
                        <label>Admin note
                          <input type="text" value={purchaseNotes[request.id] || ''}
                            onChange={e => setPurchaseNotes(prev => ({ ...prev, [request.id]: e.target.value }))} />
                        </label>
                        <button className="admin-approve" type="button"
                          disabled={reviewingPurchase === request.id}
                          onClick={() => approvePointPurchase(request)}>
                          {reviewingPurchase === request.id ? 'Processing...' : 'Verify & Award Points'}
                        </button>
                        <button className="admin-reject" type="button"
                          disabled={reviewingPurchase === request.id}
                          onClick={() => rejectPointPurchase(request)}>Reject Request</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>


          </>
        )}

{activeAdminSection === 'agents' && (
          <>
<section className="dashboard-panel">
          <span className="eyebrow">AGENT ACCOUNTS</span>
          <h2>Agent Account Management</h2>
          {agents.length === 0 ? <p>No agent accounts found.</p> : (
            <div className="dashboard-listings">
              {agents.map(agent => (
                <article className="dashboard-listing" key={agent.id}>
                  <div>
                    <strong>{agent.full_name || 'Agent'}</strong>
                    <p>{agent.phone || 'No phone number'}</p>
                    <small>{agent.email || 'Email unavailable'}</small>
                  </div>
                  <span className="listing-status approved">{agent.role === 'admin' ? 'Administrator' : 'Agent'} · {agent.points} points · {agent.is_blocked ? 'Blocked' : 'Active'}</span>
                  {agent.role === 'agent' ? (
                    <>
                      <button type="button" className="portal-submit" onClick={() => manageAgent(agent, agent.is_blocked ? 'unblock' : 'block')}>
                        {agent.is_blocked ? 'Unblock Agent' : 'Block Agent'}
                      </button>
                      <button type="button" className="portal-submit" onClick={() => manageAgent(agent, 'promote')}>
                        Promote to Admin
                      </button>
                    </>
                  ) : (
                    <button type="button" className="admin-reject" onClick={() => manageAgent(agent, 'demote')}>
                      Revoke Admin
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
          </>
        )}



          {activeAdminSection === 'verifications' && (
            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <span className="eyebrow">IDENTITY REVIEW</span>
                  <h2>Agent Verification</h2>
                </div>
                <button type="button" className="portal-submit" onClick={loadAdminData} disabled={loading}>Refresh</button>
              </div>
              {verifications.length === 0 ? (
                <p>No agent verification submissions yet.</p>
              ) : (
                <div className="dashboard-listings">
                  {verifications.map(record => {
                    const agent = agents.find(item => item.id === record.agent_id);
                    return (
                      <article className="dashboard-listing" key={record.id}>
                        <div>
                          <strong>{agent?.full_name || 'Agent'}</strong>
                          <p>{agent?.email || 'Email unavailable'}</p>
                          <p>{agent?.phone || 'No phone number'}</p>
                          <p>ID type: {record.government_id_type}</p>
                          <p>Status: <strong>{record.status.toUpperCase()}</strong></p>
                          <small>Submitted: {record.submitted_at ? new Date(record.submitted_at).toLocaleString('en-NG') : 'Unknown'}</small>
                          {record.admin_note && <p>Previous note: {record.admin_note}</p>}
                        </div>
                        <div className="dashboard-actions">
                          <button type="button" className="login" style={{ backgroundColor: '#1f2937', color: '#ffffff', border: '1px solid #1f2937', padding: '10px 14px', borderRadius: '8px', fontWeight: 600 }} onClick={() => openVerificationFile(record.government_id_path)}>View Government ID</button>
                          <button type="button" className="login" style={{ backgroundColor: '#1f2937', color: '#ffffff', border: '1px solid #1f2937', padding: '10px 14px', borderRadius: '8px', fontWeight: 600 }} onClick={() => openVerificationFile(record.selfie_path)}>View Selfie</button>
                        </div>
                        {record.status === 'pending' && (
                          <>
                            <textarea
                              placeholder="Optional note for the agent"
                              value={verificationNotes[record.id] || ''}
                              onChange={e => setVerificationNotes(prev => ({ ...prev, [record.id]: e.target.value }))}
                            />
                            <div className="dashboard-actions">
                              <button
                                type="button"
                                className="portal-submit"
                                disabled={reviewingVerification === record.agent_id}
                                onClick={() => reviewVerification(record, 'approved')}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="admin-reject"
                                disabled={reviewingVerification === record.agent_id}
                                onClick={() => reviewVerification(record, 'rejected')}
                              >
                                Reject
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

</section>
    <footer className="dashboard-footer">
      <strong>Kyrios Homes For Rent</strong>
      <span>© {new Date().getFullYear()} Kyrios Homes For Rent. All rights reserved.</span>
    </footer>
    </main>
  );
}

function DashboardRouter({ user, onLogout, onHome, backHandlerRef, openEnquiries, onEnquiriesOpened, enquiryCount, developerMode, onToggleDeveloperMode, logoName, logoSubtitle, logoInitials }) {
  const [role, setRole] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkRole() {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_blocked')
        .eq('id', user.id)
        .maybeSingle();

      if (!active) return;

      setRole(error ? 'agent' : (data?.role || 'agent'));
      setIsBlocked(!error && data?.role !== 'admin' && data?.is_blocked === true);
      setLoading(false);
    }

    checkRole();
    return () => { active = false; };
  }, [user.id]);

  if (loading) {
    return <main className="agent-dashboard"><p>Loading your control panel...</p></main>;
  }

  if (isBlocked) {
    return <main className="agent-dashboard"><h2>Account blocked</h2><p>Your agent account has been blocked. Please contact the administrator.</p><button onClick={onLogout}>Log Out</button></main>;
  }

  return role === 'admin'
    ? <AdminDashboard user={user} onLogout={onLogout} onHome={onHome} backHandlerRef={backHandlerRef} developerMode={developerMode} onToggleDeveloperMode={onToggleDeveloperMode} logoName={logoName} logoSubtitle={logoSubtitle} logoInitials={logoInitials} />
    : <AgentDashboard user={user} onLogout={onLogout} onHome={onHome} backHandlerRef={backHandlerRef} openEnquiries={openEnquiries} onEnquiriesOpened={onEnquiriesOpened} enquiryCount={enquiryCount} logoName={logoName} logoSubtitle={logoSubtitle} logoInitials={logoInitials} />;
}

function App() {
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [listingPage, setListingPage] = useState(1);

  const [showAdvancedSearchPage, setShowAdvancedSearchPage] = useState(false);
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterPropertyType, setFilterPropertyType] = useState('');
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [filterBedrooms, setFilterBedrooms] = useState('');
  useEffect(() => {
    setListingPage(1);
  }, [location, search, filterState, filterCity, filterArea, filterPropertyType, minRent, maxRent, filterBedrooms]);

  const [menuOpen, setMenuOpen] = useState(false);
  const defaultNavLabels = {findHomes:"Find Homes",forAgents:"For Agents",about:"About",dashboard:"Dashboard",logout:"Logout",agentLogin:"Agent Login"};
  const [navLabels,setNavLabels] = useState(() => {try{return {...defaultNavLabels,...JSON.parse(localStorage.getItem("khNavLabels") || "{}")};}catch{return defaultNavLabels;}});
  const [navLabelDraft,setNavLabelDraft] = useState("");
  const [navLabelEditorKey,setNavLabelEditorKey] = useState("");
  const [navLabelEditorOpen,setNavLabelEditorOpen] = useState(false);
  const [logoEditorOpen,setLogoEditorOpen] = useState(false);
  const [logoNameDraft,setLogoNameDraft] = useState(() => localStorage.getItem("khLogoName") || "KYRIOS");
  const [logoSubtitleDraft,setLogoSubtitleDraft] = useState(() => localStorage.getItem("khLogoSubtitle") || "HOMES FOR RENT");
  const [logoInitialsDraft,setLogoInitialsDraft] = useState(() => localStorage.getItem("khLogoInitials") || "KH");
  const [headerPhotoEditorOpen,setHeaderPhotoEditorOpen] = useState(false);
  const [headerPhoto,setHeaderPhoto] = useState(() => localStorage.getItem("khHeaderPhoto") || "");
  const [headerPhotoDraft,setHeaderPhotoDraft] = useState(() => localStorage.getItem("khHeaderPhoto") || "");
  useEffect(() => {
    document.documentElement.style.setProperty("--kh-header-photo", headerPhoto ? `url("${headerPhoto}")` : "none");
  }, [headerPhoto]);
  async function handleHeaderPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async blob => {
        try {
          if (!blob) throw new Error("Could not compress this image.");
          const filePath = `header/header-${Date.now()}.jpg`;
          const { error } = await supabase.storage
            .from("website-assets")
            .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
          if (error) throw error;
          const { data } = supabase.storage.from("website-assets").getPublicUrl(filePath);
          setHeaderPhotoDraft(data.publicUrl);
          setHeaderPhoto(data.publicUrl);
        } catch (error) {
          alert("Photo upload failed: " + error.message);
        } finally {
          URL.revokeObjectURL(url);
        }
      }, "image/jpeg", 0.78);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Could not read this image. Please choose another.");
    };
    img.src = url;
  }


  const [portalMode, setPortalMode] = useState(null);
  const [dashboardUser, setDashboardUser] = useState(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [developerMode, setDeveloperMode] = useState(
    () => sessionStorage.getItem('khDeveloperMode') === 'on'
  );
  const [developerAdminVerified, setDeveloperAdminVerified] = useState(false);
  const [heroHeadline, setHeroHeadline] = useState(() => localStorage.getItem('khHeroHeadline') || 'Find a place you can call home.');
  const [heroHeadlineDraft, setHeroHeadlineDraft] = useState('');
  const [heroHeadlineEditorOpen, setHeroHeadlineEditorOpen] = useState(false);
  const [heroDescription, setHeroDescription] = useState(() => localStorage.getItem("khHeroDescription") || "Discover houses and apartments for rent. Connect directly with verified agents and find a home that fits your budget.");
  const [heroDescriptionDraft, setHeroDescriptionDraft] = useState("");
  const [heroDescriptionEditorOpen, setHeroDescriptionEditorOpen] = useState(false);
  const [heroEyebrow, setHeroEyebrow] = useState(() => localStorage.getItem("khHeroEyebrow") || "YOUR NEXT HOME STARTS HERE");
  const [heroEyebrowDraft, setHeroEyebrowDraft] = useState("");
  const [heroEyebrowEditorOpen, setHeroEyebrowEditorOpen] = useState(false);
  const [heroSearchButton, setHeroSearchButton] = useState(() => localStorage.getItem("khHeroSearchButton") || "Search Homes");
  const [heroSearchButtonDraft, setHeroSearchButtonDraft] = useState("");
  const [heroSearchButtonEditorOpen, setHeroSearchButtonEditorOpen] = useState(false);
  const [advancedSearchButton, setAdvancedSearchButton] = useState(() => localStorage.getItem("khAdvancedSearchButton") || "Advanced Property Search");
  const [advancedSearchButtonDraft, setAdvancedSearchButtonDraft] = useState("");
  const [advancedSearchButtonEditorOpen, setAdvancedSearchButtonEditorOpen] = useState(false);
  const [advancedSubmitButton, setAdvancedSubmitButton] = useState(() => localStorage.getItem("khAdvancedSubmitButton") || "Search Properties");
  const [advancedSubmitButtonDraft, setAdvancedSubmitButtonDraft] = useState("");
  const [advancedSubmitButtonEditorOpen, setAdvancedSubmitButtonEditorOpen] = useState(false);
  const [siteSettings, setSiteSettings] = useState({});
  const [siteSettingsLoaded, setSiteSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSiteSettings() {
      const { data, error } = await supabase
        .from("site_settings")
        .select("setting_value")
        .eq("setting_key", "public")
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error("Could not load website settings:", error.message);
        setSiteSettingsLoaded(true);
        return;
      }

      const value = data?.setting_value || {};
      setSiteSettings(value);
      if (value.heroHeadline) setHeroHeadline(value.heroHeadline);
      if (value.heroDescription) setHeroDescription(value.heroDescription);
      if (value.heroEyebrow) setHeroEyebrow(value.heroEyebrow);
      if (value.heroSearchButton) setHeroSearchButton(value.heroSearchButton);
      if (value.advancedSearchButton) setAdvancedSearchButton(value.advancedSearchButton);
      if (value.advancedSubmitButton) setAdvancedSubmitButton(value.advancedSubmitButton);
      if (value.navLabels) setNavLabels(previous => ({ ...previous, ...value.navLabels }));
      if (value.logoName) setLogoNameDraft(value.logoName);
      if (value.logoSubtitle) setLogoSubtitleDraft(value.logoSubtitle);
      if (value.logoInitials) setLogoInitialsDraft(value.logoInitials);
      if (value.headerPhoto) {
        setHeaderPhoto(value.headerPhoto);
        setHeaderPhotoDraft(value.headerPhoto);
      }
      setSiteSettingsLoaded(true);
    }

    loadSiteSettings();
    return () => { active = false; };
  }, []);

  async function publishSiteSettings(patch) {
    const updated = { ...siteSettings, ...patch };
    const { error } = await supabase
      .from("site_settings")
      .upsert({
        setting_key: "public",
        setting_value: updated,
        updated_at: new Date().toISOString()
      }, { onConflict: "setting_key" });

    if (error) {
      alert("Could not publish changes: " + error.message);
      return false;
    }

    setSiteSettings(updated);
    return true;
  }

  const [authLoading, setAuthLoading] = useState(true);
  const [properties, setProperties] = useState([]);
  const [featuredPromotions, setFeaturedPromotions] = useState([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [photoIndexes, setPhotoIndexes] = useState({});
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState('');
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('recentlyViewedProperties') || '[]');
      return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  const [selectedAgentProfile, setSelectedAgentProfile] = useState(null);

  function recordPropertyView(propertyId) {
    if (!propertyId) return;

    setRecentlyViewedIds(previous => {
      const updated = [
        String(propertyId),
        ...previous.filter(id => id !== String(propertyId))
      ].slice(0, 30);

      try {
        localStorage.setItem(
          'recentlyViewedProperties',
          JSON.stringify(updated)
        );
      } catch (error) {
        console.warn('Could not save recently viewed properties:', error);
      }

      return updated;
    });
  }


  const [showPageTransition, setShowPageTransition] = useState(false);
  const backHandlerRef = useRef(null);
  const skipFirstPageTransition = useRef(true);

  useEffect(() => {
    if (skipFirstPageTransition.current) {
      skipFirstPageTransition.current = false;
      return;
    }
    setShowPageTransition(true);
    const timer = window.setTimeout(() => setShowPageTransition(false), 1000);
    return () => window.clearTimeout(timer);
  }, [
    portalMode,
    dashboardUser?.id,
    showDashboard,
    showAdvancedSearchPage,
    selectedEnquiry?.id,
    selectedProperty?.id,
    selectedAgentProfile
  ]);

  const [enquirySubmitting, setEnquirySubmitting] = useState(false);
  const [enquiryFeedback, setEnquiryFeedback] = useState('');
  const [housingSubmitting, setHousingSubmitting] = useState(false);
  const [housingFeedback, setHousingFeedback] = useState('');
  const [agentRole, setAgentRole] = useState(false);
  const [agentAlertStatus, setAgentAlertStatus] = useState('Checking account...');
  const [agentEnquiryCount, setAgentEnquiryCount] = useState(0);
  const [newEnquiryNotice, setNewEnquiryNotice] = useState(null);
  const [showEnquiryInbox, setShowEnquiryInbox] = useState(false);

const [adPrivacyOptionsRequired, setAdPrivacyOptionsRequired] = useState(false);
const [adMobDiagnostic, setAdMobDiagnostic] = useState('AdMob: waiting for setup...');


useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;

  let listenerHandle;
  let cancelled = false;

  CapacitorApp.addListener('backButton', () => {
    if (dashboardUser && showDashboard) {
      backHandlerRef.current?.();
      return;
    }
    if (menuOpen) { setMenuOpen(false); return; }
    if (navLabelEditorOpen) { setNavLabelEditorOpen(false); return; }
    if (logoEditorOpen) { setLogoEditorOpen(false); return; }
    if (headerPhotoEditorOpen) { setHeaderPhotoEditorOpen(false); return; }
    if (heroHeadlineEditorOpen) { setHeroHeadlineEditorOpen(false); return; }
    if (heroDescriptionEditorOpen) { setHeroDescriptionEditorOpen(false); return; }
    if (heroEyebrowEditorOpen) { setHeroEyebrowEditorOpen(false); return; }
    if (heroSearchButtonEditorOpen) { setHeroSearchButtonEditorOpen(false); return; }
    if (advancedSearchButtonEditorOpen) { setAdvancedSearchButtonEditorOpen(false); return; }
    if (advancedSubmitButtonEditorOpen) { setAdvancedSubmitButtonEditorOpen(false); return; }
    if (selectedEnquiry !== null) { setSelectedEnquiry(null); return; }
    if (selectedAgentProfile) { setSelectedAgentProfile(null); return; }
    if (selectedProperty) { setSelectedProperty(null); return; }
    if (showEnquiryInbox) { setShowEnquiryInbox(false); return; }
    if (showAdvancedSearchPage) { setShowAdvancedSearchPage(false); return; }
    if (portalMode) { setPortalMode(null); return; }
    if (dashboardUser && !showDashboard) { setShowDashboard(true); return; }

    CapacitorApp.exitApp();
  }).then(handle => {
    if (cancelled) handle.remove();
    else listenerHandle = handle;
  });

  return () => {
    cancelled = true;
    listenerHandle?.remove();
  };
}, [
  dashboardUser, showDashboard, menuOpen, navLabelEditorOpen, logoEditorOpen,
  headerPhotoEditorOpen, heroHeadlineEditorOpen, heroDescriptionEditorOpen,
  heroEyebrowEditorOpen, heroSearchButtonEditorOpen,
  advancedSearchButtonEditorOpen, advancedSubmitButtonEditorOpen,
  selectedEnquiry, selectedAgentProfile, selectedProperty, showEnquiryInbox,
  showAdvancedSearchPage, portalMode
]);



useEffect(() => {
  if (
    !import.meta.env.PROD ||
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'android'
  ) return;

  let active = true;
  let sizeListener = null;
  let loadedListener = null;
  let failedListener = null;
  let bannerShown = false;

  const setupAds = async () => {
    try {
      if (active) setAdMobDiagnostic('Checking AdMob consent...');
      let consentInfo = await AdMob.requestConsentInfo();

      if (!active) return;

      if (
        consentInfo.isConsentFormAvailable &&
        consentInfo.status === AdmobConsentStatus.REQUIRED
      ) {
        consentInfo = await AdMob.showConsentForm();
      }

      if (!active) return;

      setAdPrivacyOptionsRequired(
        consentInfo.privacyOptionsRequirementStatus === 'REQUIRED'
      );

      if (!consentInfo.canRequestAds) {
        setAdMobDiagnostic('AdMob consent does not allow ad requests.');
        console.warn('AdMob: consent does not allow ad requests.', consentInfo);
        return;
      }
      setAdMobDiagnostic('Consent accepted. Initializing AdMob...');
      console.log('AdMob: consent allows ad requests.');

      await AdMob.initialize();

      if (!active) return;

      sizeListener = await AdMob.addListener(
        BannerAdPluginEvents.SizeChanged,
        (size) => {
          if (active) {
            document.documentElement.style.setProperty(
              '--admob-banner-height',
              `${Math.max(0, size.height)}px`
            );
          }
        }
      );

      loadedListener = await AdMob.addListener(
        BannerAdPluginEvents.Loaded,
        () => { if (active) setAdMobDiagnostic('Success: banner ad loaded.'); console.log('AdMob: banner loaded successfully.'); }
      );

      failedListener = await AdMob.addListener(
        BannerAdPluginEvents.FailedToLoad,
        (error) => { if (active) setAdMobDiagnostic('Banner failed: ' + String(error?.message || error)); console.error('AdMob: banner failed to load:', error); }
      );

      setAdMobDiagnostic('Requesting banner ad...');
      console.log('AdMob: requesting banner...');
      await AdMob.showBanner({
        adId: 'ca-app-pub-3549722891067696/2166428406',
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0
      });

      bannerShown = true;
    } catch (error) {
      if (active) setAdMobDiagnostic('AdMob setup failed: ' + String(error?.message || error));
      console.error('AdMob setup failed:', error);
    }
  };

  setupAds();

  return () => {
    active = false;
    document.documentElement.style.removeProperty('--admob-banner-height');

    if (sizeListener) sizeListener.remove();
    if (loadedListener) loadedListener.remove();
    if (failedListener) failedListener.remove();

    if (bannerShown) {
      AdMob.removeBanner().catch((error) => {
        console.error('AdMob cleanup failed:', error);
      });
    }
  };
}, []);


  useEffect(() => {
    if (!properties.length) return;

    const timer = setInterval(() => {
      setPhotoIndexes(current => {
        const next = { ...current };

        properties.forEach(property => {
          const count = (property.photo_urls || []).filter(Boolean).length;
          next[property.id] = count > 1
            ? ((current[property.id] || 0) + 1) % count
            : 0;
        });

        return next;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [properties]);


  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) {
          setDashboardUser(session?.user ?? null);
          setAuthLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) {
        setDashboardUser(session?.user ?? null);
        setAuthLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function verifyDeveloperAdmin() {
      if (!dashboardUser?.id) {
        setDeveloperAdminVerified(false);
        setDeveloperMode(false);
        sessionStorage.removeItem('khDeveloperMode');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', dashboardUser.id)
        .maybeSingle();

      if (!active) return;

      const isAdmin = !error && data?.role === 'admin';
      setDeveloperAdminVerified(isAdmin);

      if (!isAdmin) {
        setDeveloperMode(false);
        sessionStorage.removeItem('khDeveloperMode');
      }
    }

    verifyDeveloperAdmin();
    return () => { active = false; };
  }, [dashboardUser?.id]);

  useEffect(() => {
    if (!dashboardUser?.id) {
      setAgentRole(false);
      setAgentAlertStatus('Signed out');
      setAgentEnquiryCount(0);
      setNewEnquiryNotice(null);
      setShowEnquiryInbox(false);
      return;
    }

    let active = true;
    let pollTimer = null;
    let lastChecked = null;

    async function startPolling() {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', dashboardUser.id)
        .maybeSingle();

      if (!active) return;

      if (error || data?.role !== 'agent') {
        setAgentRole(false);
        setAgentAlertStatus(
          error ? 'Profile check failed: ' + error.message : 'This account is not an agent'
        );
        setAgentEnquiryCount(0);
        setNewEnquiryNotice(null);
        return;
      }

      setAgentRole(true);

      const { count, error: countError } = await supabase
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', dashboardUser.id);

      if (!active) return;

      if (countError) {
        setAgentAlertStatus('Count error: ' + countError.message);
        return;
      }

      setAgentEnquiryCount(count ?? 0);
      lastChecked = new Date().toISOString();
      setAgentAlertStatus('Polling active - checking every 5 seconds');

      const seenIds = new Set();

      async function checkForNewEnquiries() {
        if (!active || !lastChecked) return;

        const { data: rows, error } = await supabase
          .from('enquiries')
          .select('*')
          .eq('agent_id', dashboardUser.id)
          .gte('created_at', lastChecked)
          .order('created_at', { ascending: true });

        if (!active) return;

        if (error) {
          setAgentAlertStatus('Polling error: ' + error.message);
          return;
        }

        if (!rows?.length) return;

        const fresh = rows.filter(row => !seenIds.has(row.id));

        rows.forEach(row => seenIds.add(row.id));

        for (const row of rows) {
          if (row.created_at > lastChecked) {
            lastChecked = row.created_at;
          }
        }

        if (fresh.length > 0) {
          setAgentEnquiryCount(current => current + fresh.length);
          setNewEnquiryNotice(fresh[fresh.length - 1]);
        }
      }

      checkForNewEnquiries();
      pollTimer = setInterval(checkForNewEnquiries, 5000);
    }

    startPolling();

    return () => {
      active = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [dashboardUser?.id]);

  useEffect(() => {
    async function loadApprovedProperties() {
      setPropertiesLoading(true);
      setPropertiesError('');

      const { data, error } = await supabase
        .from('properties')
        .select('id, agent_id, title, property_type, state, city, area, address, rent_amount, agreement_fee, agency_fee, caution_fee, first_payment_total, bedrooms, bathrooms, description, contact_phone, photo_urls, availability_status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) {
        setPropertiesError(error.message);
      } else {
        const agentIds = [...new Set((data || []).map(item => item.agent_id).filter(Boolean))];
      let agentRows = [];
      if (agentIds.length) {
        const { data: rows, error: agentError } = await supabase.rpc('get_public_agent_badges');
        if (agentError) console.error('Could not load public agent badges:', agentError.message);
        agentRows = rows || [];
      }

      const agentMap = new Map();
      agentRows.forEach(agent => {
        const previous = agentMap.get(agent.agent_id);
        agentMap.set(agent.agent_id, {
          full_name: agent.full_name,
          verified: agent.verified === true || previous?.verified === true
        });
      });

      setProperties((data || []).map(property => {
        const agent = agentMap.get(property.agent_id);
        return {
          ...property,
          agent_name: agent?.full_name || 'Property Agent',
          agent_verified: agent?.verified === true
        };
      }));

      const now = new Date().toISOString();
      const { data: promotionRows, error: promotionError } = await supabase
        .from('property_promotions')
        .select('property_id, starts_at, expires_at')
        .lte('starts_at', now)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });
      if (promotionError) console.error(promotionError.message);
      setFeaturedPromotions(promotionRows || []);
      }

      setPropertiesLoading(false);
    }

    loadApprovedProperties();

    const channel = supabase
      .channel('homepage-approved-properties')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'properties' },
        () => loadApprovedProperties()
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadApprovedProperties();
      }
    };

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (featuredPromotions.length < 2) return;
    const timer = setInterval(() => {
      setFeaturedIndex(i => (i + 1) % featuredPromotions.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [featuredPromotions.length]);

  const featuredProperties = featuredPromotions
    .filter(item => new Date(item.expires_at) > new Date())
    .map(item => properties.find(property => property.id === item.property_id))
    .filter(Boolean);

  const featuredProperty = featuredProperties.length
    ? featuredProperties[featuredIndex % featuredProperties.length]
    : null;

  const normalizeSearch = value =>
    String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

  const availableStates = [...new Set(properties.map(p => p.state).filter(Boolean))].sort();
  const availableCities = [...new Set(properties
    .filter(p => !filterState || normalizeSearch(p.state) === normalizeSearch(filterState))
    .map(p => p.city).filter(Boolean))].sort();
  const availableAreas = [...new Set(properties
    .filter(p =>
      (!filterState || normalizeSearch(p.state) === normalizeSearch(filterState)) &&
      (!filterCity || normalizeSearch(p.city) === normalizeSearch(filterCity))
    )
    .map(p => p.area).filter(Boolean))].sort();
  const availablePropertyTypes = [...new Set(properties.map(p => p.property_type).filter(Boolean))].sort();
  const availableBedrooms = [...new Set(properties.map(p => Number(p.bedrooms)).filter(n => n > 0))].sort((a, b) => a - b);

  const locationTerm = normalizeSearch(location);
  const searchTerm = normalizeSearch(search);

  const filtered = properties.filter(p => {
    const propertyLocation = normalizeSearch([
      p.state, p.city, p.area, p.address
    ].join(' '));

    const propertyDetails = normalizeSearch([
      p.title,
      p.property_type,
      p.description,
      p.bedrooms,
      p.bathrooms,
      p.rent_amount,
      p.first_payment_total,
      p.bedrooms ? p.bedrooms + ' bedroom' : '',
      p.bathrooms ? p.bathrooms + ' bathroom' : ''
    ].join(' '));

    const locationMatches = !locationTerm ||
      locationTerm.split(' ').every(word => propertyLocation.includes(word));

    const searchMatches = !searchTerm ||
      searchTerm.split(' ').every(word => propertyDetails.includes(word));

    const stateMatches = !filterState || normalizeSearch(p.state) === normalizeSearch(filterState);
    const cityMatches = !filterCity || normalizeSearch(p.city) === normalizeSearch(filterCity);
    const areaMatches = !filterArea || normalizeSearch(p.area) === normalizeSearch(filterArea);
    const typeMatches = !filterPropertyType || normalizeSearch(p.property_type) === normalizeSearch(filterPropertyType);
    const rent = Number(p.rent_amount || 0);
    const minRentMatches = minRent === '' || rent >= Number(minRent);
    const maxRentMatches = maxRent === '' || rent <= Number(maxRent);
    const bedroomsMatches = filterBedrooms === '' || Number(p.bedrooms) === Number(filterBedrooms);

    return locationMatches && searchMatches && stateMatches && cityMatches &&
      areaMatches && typeMatches && minRentMatches && maxRentMatches && bedroomsMatches;
  });

  const recentlyViewedSet = new Set(recentlyViewedIds);

  const recentlyViewedFirst = [...filtered].sort((a, b) => {
    const aIndex = recentlyViewedIds.indexOf(String(a.id));
    const bIndex = recentlyViewedIds.indexOf(String(b.id));

    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });

  const listingPageCount = Math.max(1, Math.ceil(recentlyViewedFirst.length / 5));
  const paginatedProperties = recentlyViewedFirst.slice((listingPage - 1) * 5, listingPage * 5);

  const formatNaira = amount =>
    '₦' + Number(amount || 0).toLocaleString('en-NG');

  async function submitPropertyEnquiry(e, property) {
    e.preventDefault();
    const form = e.currentTarget;
    setEnquirySubmitting(true);
    setEnquiryFeedback('');

    const values = new FormData(form);
    const { error } = await supabase.from('enquiries').insert({
      property_id: property.id,
      agent_id: property.agent_id,
      customer_name: values.get('customer_name').trim(),
      customer_phone: values.get('customer_phone').trim(),
      message: values.get('message').trim()
    });

    if (error) {
      setEnquiryFeedback('Could not send enquiry: ' + error.message);
    } else {
      setEnquiryFeedback('Your enquiry has been sent successfully.');
      form.reset();
    }
    setEnquirySubmitting(false);
  }

  async function submitHousingRequest(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setHousingSubmitting(true);
    setHousingFeedback('');

    const values = new FormData(form);
    const { error } = await supabase.from('housing_requests').insert({
      customer_name: values.get('customer_name').trim(),
      customer_phone: values.get('customer_phone').trim(),
      state: values.get('state').trim(),
      city: values.get('city').trim(),
      area: values.get('area').trim(),
      budget: Number(values.get('budget')),
      property_type: values.get('property_type'),
      bedrooms: Number(values.get('bedrooms') || 0),
      description: values.get('description').trim()
    });

    if (error) {
      setHousingFeedback('Could not submit request: ' + error.message);
    } else {
      setHousingFeedback('Your housing request has been submitted successfully.');
      form.reset();
    }
    setHousingSubmitting(false);
  }

  return (
    <main>
      {developerMode && developerAdminVerified && (
        <div style={{ position: 'fixed', bottom: 'calc(var(--admob-banner-height, 0px) + 16px)', right: '12px', zIndex: 9999, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', maxWidth: 'min(420px, calc(100vw - 24px))', padding: '8px 10px', borderRadius: '10px', background: '#172554', color: '#fff' }}>
          <strong style={{ fontSize: '12px' }}>DEVELOPER MODE</strong><button type="button" onClick={() => setLogoEditorOpen(true)}>Edit Logo</button><button type="button" onClick={() => setHeaderPhotoEditorOpen(true)}>Edit Header Photo</button>
          <button type="button" onClick={() => {
            setDeveloperMode(false);
            sessionStorage.setItem('khDeveloperMode', 'off');
          }}>Exit</button>
          <small style={{ flexBasis: '100%', maxWidth: '320px', fontSize: '11px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{adMobDiagnostic}</small>
        </div>
      )}
      {developerMode && developerAdminVerified && logoEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10001,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit Website Logo</h3>
          <label>Brand name</label>
          <input value={logoNameDraft} onChange={e => setLogoNameDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <label>Subtitle</label>
          <input value={logoSubtitleDraft} onChange={e => setLogoSubtitleDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <label>Logo initials</label>
          <input value={logoInitialsDraft} onChange={e => setLogoInitialsDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"12px"}}>
            <button type="button" onClick={async () => {if(await publishSiteSettings({logoName:logoNameDraft,logoSubtitle:logoSubtitleDraft,logoInitials:logoInitialsDraft})){setLogoEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setLogoEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && headerPhotoEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10002,width:"min(360px,calc(100vw - 24px))",maxHeight:"80vh",overflowY:"auto",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit Header Background Photo</h3>
          <input type="file" accept="image/*" onChange={handleHeaderPhotoUpload} />
          {headerPhotoDraft && <img src={headerPhotoDraft} alt="Header background preview" style={{width:"100%",height:"100px",objectFit:"cover",marginTop:"10px",borderRadius:"8px"}} />}
          <p style={{fontSize:"12px"}}>The photo fits the existing header size. It will be cropped neatly, not stretched.</p>
          <div style={{display:"flex",gap:"7px",marginTop:"12px",flexWrap:"wrap"}}>
            <button type="button" onClick={async () => {if(await publishSiteSettings({headerPhoto:headerPhotoDraft})){setHeaderPhoto(headerPhotoDraft);setHeaderPhotoEditorOpen(false);}}}>Publish Photo</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({headerPhoto:""})){setHeaderPhoto("");setHeaderPhotoDraft("");}}}>Remove Photo</button>
            <button type="button" onClick={() => setHeaderPhotoEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {developerMode && developerAdminVerified && heroHeadlineEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10000,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit homepage headline</h3>
          <textarea value={heroHeadlineDraft} onChange={e => setHeroHeadlineDraft(e.target.value)} rows={4} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setHeroHeadline(heroHeadlineDraft)}>Preview</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({heroHeadline:heroHeadlineDraft})){setHeroHeadline(heroHeadlineDraft);setHeroHeadlineEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setHeroHeadlineEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && heroDescriptionEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10000,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit homepage description</h3>
          <textarea value={heroDescriptionDraft} onChange={e => setHeroDescriptionDraft(e.target.value)} rows={5} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setHeroDescription(heroDescriptionDraft)}>Preview</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({heroDescription:heroDescriptionDraft})){setHeroDescription(heroDescriptionDraft);setHeroDescriptionEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setHeroDescriptionEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && heroEyebrowEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10000,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit homepage eyebrow text</h3>
          <input value={heroEyebrowDraft} onChange={e => setHeroEyebrowDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setHeroEyebrow(heroEyebrowDraft)}>Preview</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({heroEyebrow:heroEyebrowDraft})){setHeroEyebrow(heroEyebrowDraft);setHeroEyebrowEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setHeroEyebrowEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && heroSearchButtonEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10000,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit homepage search button</h3>
          <input value={heroSearchButtonDraft} onChange={e => setHeroSearchButtonDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setHeroSearchButton(heroSearchButtonDraft)}>Preview</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({heroSearchButton:heroSearchButtonDraft})){setHeroSearchButton(heroSearchButtonDraft);setHeroSearchButtonEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setHeroSearchButtonEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && advancedSearchButtonEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10000,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit advanced search button</h3>
          <input value={advancedSearchButtonDraft} onChange={e => setAdvancedSearchButtonDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setAdvancedSearchButton(advancedSearchButtonDraft)}>Preview</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({advancedSearchButton:advancedSearchButtonDraft})){setAdvancedSearchButton(advancedSearchButtonDraft);setAdvancedSearchButtonEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setAdvancedSearchButtonEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && advancedSubmitButtonEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10000,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit Search Properties button</h3>
          <input value={advancedSubmitButtonDraft} onChange={e => setAdvancedSubmitButtonDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setAdvancedSubmitButton(advancedSubmitButtonDraft)}>Preview</button>
            <button type="button" onClick={async () => {if(await publishSiteSettings({advancedSubmitButton:advancedSubmitButtonDraft})){setAdvancedSubmitButton(advancedSubmitButtonDraft);setAdvancedSubmitButtonEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setAdvancedSubmitButtonEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {developerMode && developerAdminVerified && navLabelEditorOpen && (
        <div style={{position:"fixed",top:"70px",right:"12px",zIndex:10001,width:"min(360px,calc(100vw - 24px))",padding:"16px",background:"#fff",color:"#172554",border:"1px solid #cbd5e1",borderRadius:"12px",boxShadow:"0 12px 35px #0003"}}>
          <h3>Edit navigation label</h3>
          <input value={navLabelDraft} onChange={e => setNavLabelDraft(e.target.value)} style={{width:"100%",padding:"10px",boxSizing:"border-box"}} />
          <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
            <button type="button" onClick={() => setNavLabels(prev => ({...prev,[navLabelEditorKey]:navLabelDraft}))}>Preview</button>
            <button type="button" onClick={async () => {const updated={...navLabels,[navLabelEditorKey]:navLabelDraft};if(await publishSiteSettings({navLabels:updated})){setNavLabels(updated);setNavLabelEditorOpen(false);}}}>Publish Changes</button>
            <button type="button" onClick={() => setNavLabelEditorOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {showPageTransition && (
        <div className="page-transition-splash">
          <span className="brand-icon">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path className="logo-roof" d="M7 29 32 8l25 21" />
              <path className="logo-house" d="M14 25v31h36V25" />
              <text x="32" y="45" textAnchor="middle">KH</text>
            </svg>
          </span>
        </div>
      )}
      {agentRole && newEnquiryNotice && (
        <div className="agent-enquiry-alert-wrap">
          <button
            type="button"
            className="agent-enquiry-alert"
            onClick={() => {
              setShowDashboard(true);
              setShowEnquiryInbox(true);
              setNewEnquiryNotice(null);
            }}
          >
            <span className="agent-enquiry-alert-title">New property enquiry</span>
            <span>{newEnquiryNotice.customer_name || 'A customer'} sent you a new property enquiry.</span>
            <strong>Open enquiry inbox <ArrowRight size={16} /></strong>
          </button>
        </div>
      )}
      {authLoading ? (
        <div className="session-loading">Restoring your session...</div>
      ) : dashboardUser && showDashboard ? (
        <DashboardRouter
          user={dashboardUser}
          logoName={logoNameDraft} logoSubtitle={logoSubtitleDraft} logoInitials={logoInitialsDraft}
          developerMode={developerMode}
          onToggleDeveloperMode={() => {
            if (!developerAdminVerified) return;
            setDeveloperMode(current => {
              const next = !current;
              sessionStorage.setItem('khDeveloperMode', next ? 'on' : 'off');
              return next;
            });
          }}
          openEnquiries={showEnquiryInbox} backHandlerRef={backHandlerRef}
          onEnquiriesOpened={() => setShowEnquiryInbox(false)}
          enquiryCount={agentEnquiryCount}
          onHome={() => setShowDashboard(false)}
          onLogout={async () => {
            await supabase.auth.signOut();
            setDashboardUser(null);
          }}
        />
      ) : (
        <>
          {portalMode && (
            <AgentPortal
              initialMode={portalMode}
              logoName={logoNameDraft}
              logoSubtitle={logoSubtitleDraft}
              logoInitials={logoInitialsDraft}
              onClose={() => setPortalMode(null)}
              onLogin={user => {
                setDashboardUser(user);
                setShowDashboard(true);
                setPortalMode(null);
              }}
            />
          )}
      <header className="header">
        <BrandLogo name={logoNameDraft} subtitle={logoSubtitleDraft} initials={logoInitialsDraft} />
        <nav className={menuOpen ? 'mobile-nav open' : 'mobile-nav'}>
          <a href="#homes" onClick={() => setMenuOpen(false)} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("findHomes");setNavLabelDraft(navLabels.findHomes);setNavLabelEditorOpen(true);}}>{navLabels.findHomes}</a>
          <a href="#agents" onClick={() => setMenuOpen(false)} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("forAgents");setNavLabelDraft(navLabels.forAgents);setNavLabelEditorOpen(true);}}>{navLabels.forAgents}</a>
          <a href="#about" onClick={() => setMenuOpen(false)} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("about");setNavLabelDraft(navLabels.about);setNavLabelEditorOpen(true);}}>{navLabels.about}</a>
          {dashboardUser ? (
            <>
              <button className="login" onClick={() => {if(developerMode && developerAdminVerified)return;setMenuOpen(false);setShowDashboard(true);}} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("dashboard");setNavLabelDraft(navLabels.dashboard);setNavLabelEditorOpen(true);}}>{navLabels.dashboard}</button>
              <button className="login" onClick={async () => {if(developerMode && developerAdminVerified)return;setMenuOpen(false);await supabase.auth.signOut();setDashboardUser(null);setShowDashboard(true);}} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("logout");setNavLabelDraft(navLabels.logout);setNavLabelEditorOpen(true);}}>{navLabels.logout}</button>
            </>
          ) : (
            <button className="login" onClick={() => {setMenuOpen(false); setPortalMode("login");}}>
            <User size={17} /> <span onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("agentLogin");setNavLabelDraft(navLabels.agentLogin);setNavLabelEditorOpen(true);}} title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}>{navLabels.agentLogin}</span>
            </button>
          )}
        </nav>
        <button
          className="menu"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Menu />
        </button>
      </header>

      {!showAdvancedSearchPage && <>
      <section className="top-advert">
        <span className="ad-label">FEATURED PROPERTY</span>
        {featuredProperty ? (
          <div
            className="ad-content"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              recordPropertyView(featuredProperty.id);
              setSelectedProperty(featuredProperty);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                recordPropertyView(featuredProperty.id);
                setSelectedProperty(featuredProperty);
              }
            }}
          >
            {(featuredProperty.photo_urls || []).filter(Boolean).length > 0 ? (
              <div className={(featuredProperty.photo_urls || []).filter(Boolean).length > 1 ? "ad-images two" : "ad-images single"}>
                {(featuredProperty.photo_urls || []).filter(Boolean).slice(0, 2).map((url, index) => (
                  <img key={url + index} src={url} alt={`${featuredProperty.title} photo ${index + 1}`} loading="lazy" />
                ))}
              </div>
              ) : (
                <div className="ad-images single">
                  <img src="/images/default-house.jpg" alt={`${featuredProperty.title} property`} loading="lazy" />
                </div>
              )}
            <strong>{featuredProperty.title}</strong>
            <span>{featuredProperty.area}, {featuredProperty.city}, {featuredProperty.state}</span>
            <span>Annual rent: {formatNaira(featuredProperty.rent_amount)}</span>
          </div>
        ) : (
          <div className="ad-content">
            <strong>Featured properties will appear here.</strong>
            <span>Agents can promote approved properties from their dashboard.</span>
          </div>
        )}
        <span className="ad-placeholder">Sponsored</span>
      </section>

      <section className="hero">
        <div className="hero-content">
          <span
            className="eyebrow"
            style={{cursor:developerMode && developerAdminVerified ? "pointer" : "inherit"}}
            title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}
            onDoubleClick={() => {
              if (!developerMode || !developerAdminVerified) return;
              setHeroEyebrowDraft(heroEyebrow);
              setHeroEyebrowEditorOpen(true);
            }}
          >{heroEyebrow}</span>
          <h1
            style={{whiteSpace:"pre-line",cursor:developerMode && developerAdminVerified ? "pointer" : "inherit"}}
            title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}
            onDoubleClick={() => {
              if (!developerMode || !developerAdminVerified) return;
              setHeroHeadlineDraft(heroHeadline);
              setHeroHeadlineEditorOpen(true);
            }}
          >{heroHeadline}</h1>
          <p
            style={{cursor:developerMode && developerAdminVerified ? "pointer" : "inherit"}}
            title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}
            onDoubleClick={() => {
              if (!developerMode || !developerAdminVerified) return;
              setHeroDescriptionDraft(heroDescription);
              setHeroDescriptionEditorOpen(true);
            }}
          >{heroDescription}</p>
          <div className="search-panel">
            <label>
              <span>Property location</span>
              <div><MapPin size={18} /><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Enter city or state" /></div>
            </label>
            <label>
              <span>Property name</span>
              <div><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="What are you looking for?" /></div>
            </label>
            <button
              onClick={() => document.getElementById("homes").scrollIntoView({ behavior: "smooth" })}
              onDoubleClick={e => {
                if (!developerMode || !developerAdminVerified) return;
                e.preventDefault();
                e.stopPropagation();
                setHeroSearchButtonDraft(heroSearchButton);
                setHeroSearchButtonEditorOpen(true);
              }}
              title={developerMode && developerAdminVerified ? "Double-click to edit button text" : undefined}
            >{heroSearchButton} <ArrowRight size={17} /></button>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="advanced-search-open"
        hidden={showAdvancedSearchPage}
        onClick={() => {
          if (developerMode && developerAdminVerified) return;
          setShowAdvancedSearchPage(true);
          setMenuOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onDoubleClick={e => {
          if (!developerMode || !developerAdminVerified) return;
          e.preventDefault();
          e.stopPropagation();
          setAdvancedSearchButtonDraft(advancedSearchButton);
          setAdvancedSearchButtonEditorOpen(true);
        }}
        title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}
      >
        {advancedSearchButton} <ArrowRight size={17} />
      </button>
      </>}
      <section className="homes" id="homes">
        {showAdvancedSearchPage && (
          <button
            type="button"
            className="advanced-search-back"
            onClick={() => {
              setShowAdvancedSearchPage(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            ← Back to Home
          </button>
        )}
        <div className="section-heading">
          <div><span className="eyebrow">EXPLORE PROPERTIES</span><h2>Homes you may love</h2></div>
          <span className="count">{propertiesLoading ? "Loading..." : `${filtered.length} properties`}</span>
        </div>
        {showAdvancedSearchPage && <div className="advanced-search-filters">
          <h3>Advanced Property Filters</h3>
          <div className="advanced-filter-grid">
            <label>State
              <select value={filterState} onChange={e => {
                setFilterState(e.target.value);
                setFilterCity('');
                setFilterArea('');
              }}>
                <option value="">All states</option>
                {availableStates.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>City
              <select value={filterCity} onChange={e => {
                setFilterCity(e.target.value);
                setFilterArea('');
              }}>
                <option value="">All cities</option>
                {availableCities.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Area
              <select value={filterArea} onChange={e => setFilterArea(e.target.value)}>
                <option value="">All areas</option>
                {availableAreas.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Property type
              <select value={filterPropertyType} onChange={e => setFilterPropertyType(e.target.value)}>
                <option value="">All property types</option>
                {availablePropertyTypes.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Minimum annual rent (₦)
              <input type="number" min="0" value={minRent} onChange={e => setMinRent(e.target.value)} placeholder="No minimum" />
            </label>
            <label>Maximum annual rent (₦)
              <input type="number" min="0" value={maxRent} onChange={e => setMaxRent(e.target.value)} placeholder="No maximum" />
            </label>
            <label>Bedrooms
              <select value={filterBedrooms} onChange={e => setFilterBedrooms(e.target.value)}>
                <option value="">Any number</option>
                {availableBedrooms.map(item => <option key={item} value={item}>{item} bedroom{item === 1 ? '' : 's'}</option>)}
              </select>
            </label>
          <button
            type="button"
            className="portal-submit advanced-search-submit"
            onClick={() => {
              if (developerMode && developerAdminVerified) return;
              document.getElementById('advanced-search-results')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }}
            onDoubleClick={e => {
              if (!developerMode || !developerAdminVerified) return;
              e.preventDefault();
              e.stopPropagation();
              setAdvancedSubmitButtonDraft(advancedSubmitButton);
              setAdvancedSubmitButtonEditorOpen(true);
            }}
            title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}
          >
            {advancedSubmitButton}
          </button>
        </div>
          <button type="button" className="clear-property-filters" onClick={() => {
            setLocation('');
            setSearch('');
            setFilterState('');
            setFilterCity('');
            setFilterArea('');
            setFilterPropertyType('');
            setMinRent('');
            setMaxRent('');
            setFilterBedrooms('');
          }}>Clear all filters</button>
        </div>}
        <div className="property-grid" id="advanced-search-results">
          {propertiesLoading && <p>Loading available homes...</p>}

          {propertiesError && (
            <p className="property-error">Could not load properties: {propertiesError}</p>
          )}

          {!propertiesLoading && !propertiesError && paginatedProperties.map(p => {
            const phone = (p.contact_phone || '').replace(/\D/g, '');
            const whatsappPhone = phone.startsWith('0')
              ? '234' + phone.slice(1)
              : phone;

            const whatsappMessage = [
              'Hello, I am interested in this property listed on Kyrios Homes For Rent.',
              '',
              `Property: ${p.title || 'Not specified'}`,
              `Property type: ${p.property_type || 'Not specified'}`,
              `Rent: ${p.rent_amount ? '₦' + Number(p.rent_amount).toLocaleString('en-NG') : 'Not specified'}`,
              `Initial payment: ${p.first_payment_total ? '₦' + Number(p.first_payment_total).toLocaleString('en-NG') : 'Not specified'}`,
              `Location: ${[p.area, p.city, p.state].filter(Boolean).join(', ') || 'Not specified'}`,
              `Address: ${p.address || 'Not specified'}`,
              `Bedrooms: ${p.bedrooms ?? 'Not specified'}`,
              `Bathrooms: ${p.bathrooms ?? 'Not specified'}`,
              '',
              'Description:',
              p.description || 'No description provided.',
              '',
              'Please provide more information about this property.'
            ].join('\n');

            const whatsappLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`;

            const photos = (p.photo_urls || []).filter(Boolean);
            const photoIndex = photos.length
              ? (photoIndexes[p.id] || 0) % photos.length
              : 0;

            return (
              <article className="property" id={`property-${p.id}`} key={p.id}>
                {photos.length > 0 ? (
                  <div className="property-photo-gallery slideshow-gallery">
                    <img
                      src={photos[photoIndex]}
                      alt={`${p.title} photo ${photoIndex + 1}`}
                      loading="lazy"
                    />
                    <span className="photo-counter">
                      {photoIndex + 1} / {photos.length}
                    </span>
                  </div>
                ) : (
                    <img className="property-listing-default-photo" src="/images/default-house.jpg" alt={`${p.title} property`} loading="lazy" />
                )}

                <div className="property-info">
                  <span className="property-type">{p.property_type}</span>
                  {p.availability_status !== 'available' && (
                    <span style={{
                      display: 'inline-block',
                      marginTop: '8px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: p.availability_status === 'rented' ? '#b42318' : '#777',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '12px'
                    }}>
                      {p.availability_status === 'rented' ? 'RENTED' : 'UNAVAILABLE'}
                    </span>
                  )}
                  <h3>{p.title}</h3>
                  <p className="location">
                    <MapPin size={15} /> {p.area}, {p.city}, {p.state}
                  </p>
        <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0', fontSize: '14px', color: '#374151' }}>
          Listed by <strong>{p.agent_name || 'Property Agent'}</strong>
          {p.agent_verified && (
            <span title="Verified agent" aria-label="Verified agent" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '17px', height: '17px', borderRadius: '50%', background: '#1877F2', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>
          )}
        </p>
              {p.agent_id && <button type="button" className="agent-profile-link" onClick={() => setSelectedAgentProfile(p.agent_id)}>View Agent Profile</button>}


                  <div className="features">
                    <span><BedDouble size={16} /> {p.bedrooms} Bedroom</span>
                    <span><Bath size={16} /> {p.bathrooms} Bathroom</span>
                  </div>
                  {p.description && (
                    <p className="public-property-description">{p.description}</p>
                  )}
                  <div className="public-property-cost">
                    <strong>{formatNaira(p.rent_amount)}<small> / year rent</small></strong>
                    <span>First payment: {formatNaira(p.first_payment_total)}</span>
                  </div>
                  <button type="button" className="portal-submit"
                    style={{ marginTop: '10px', width: '100%' }}
                    onClick={() => { recordPropertyView(p.id); setSelectedProperty(p); }}>
                    View Full Details
                  </button>
                  {(p.availability_status || 'available') === 'available' ? (
                    <>
                  <button
                    type="button"
                    className="portal-submit enquiry-toggle"
                    onClick={() => {
                      setSelectedEnquiry(selectedEnquiry === p.id ? null : p.id);
                      setEnquiryFeedback('');
                    }}
                  >
                    {selectedEnquiry === p.id ? 'Close Enquiry Form' : 'Send Enquiry'}
                  </button>

                  {selectedEnquiry === p.id && (
                    <form className="customer-request-form" onSubmit={e => submitPropertyEnquiry(e, p)}>
                      <h4>Enquire about {p.title}</h4>
                      <label>Your full name
                        <input name="customer_name" required maxLength="100" placeholder="Enter your name" />
                      </label>
                      <label>Phone number
                        <input name="customer_phone" type="tel" required maxLength="25" placeholder="Enter your phone number" />
                      </label>
                      <label>Your message
                        <textarea name="message" required maxLength="1500" placeholder="I am interested in this property..." />
                      </label>
                      {enquiryFeedback && <p className="portal-message">{enquiryFeedback}</p>}
                      <button className="portal-submit" disabled={enquirySubmitting}>
                        {enquirySubmitting ? 'Sending...' : 'Submit Enquiry'}
                      </button>
                    </form>
                  )}
                    </>
                  ) : (
                    <p style={{ color: '#b42318', fontWeight: 'bold', marginTop: '12px' }}>
                      {p.availability_status === 'rented'
                        ? 'This property has been rented.'
                        : 'This property is currently unavailable.'}
                    </p>
                  )}
                  <div className="public-property-contact">
                    <a href={`tel:${p.contact_phone}`}>
                      <Phone size={16} /> Call Agent
                    </a>
                    {whatsappPhone && (
                      <a href={whatsappLink} target="_blank" rel="noreferrer">
                        WhatsApp Agent
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {!propertiesLoading && !propertiesError && filtered.length === 0 && (
            <p>No approved properties match your search. Try another location or check back later.</p>
          )}
        {!propertiesLoading && !propertiesError && recentlyViewedFirst.length > 5 && (
          <div className="listing-pagination">
            <button type="button" disabled={listingPage === 1}
              onClick={() => {
                setListingPage(page => Math.max(1, page - 1));
                document.getElementById('advanced-search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
              Previous
            </button>
            <span>Page {listingPage} of {listingPageCount}</span>
            <button type="button" disabled={listingPage >= listingPageCount}
              onClick={() => {
                setListingPage(page => Math.min(listingPageCount, page + 1));
                document.getElementById('advanced-search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
              Next
            </button>
          </div>
        )}

        </div>
      </section>

      {selectedAgentProfile && (() => {
        const agentProperties = properties.filter(x => x.agent_id === selectedAgentProfile);
        const agent = agentProperties[0];
        if (!agent) return null;
        const phone = (agent.contact_phone || '').replace(/\D/g, '');
        const whatsapp = phone.startsWith('0') ? '234' + phone.slice(1) : phone;
        return (
          <div className="property-details-page" style={{position:'fixed',inset:0,zIndex:10001,background:'#fff',overflowY:'auto',padding:'20px',color:'#222'}}>
            <div className="property-details-container">
              <button className="portal-submit details-back" onClick={() => setSelectedAgentProfile(null)}>← Back to Properties</button>
              <section className="public-agent-profile-card">
                <h2>{agent.agent_name || 'Property Agent'} {agent.agent_verified && <span className="agent-verified-badge">✓</span>}</h2>
                <p>{agent.agent_verified ? 'Verified Agent' : 'Property Agent'}</p>
                <p><strong>Contact:</strong> {agent.contact_phone || 'Not provided'}</p>
                <div className="public-property-contact">
                  {phone && <a href={`tel:${agent.contact_phone}`}><Phone size={16}/> Call Agent</a>}
                  {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">WhatsApp Agent</a>}
                </div>
              </section>
              <h3>Approved Properties ({agentProperties.length})</h3>
              <div className="property-grid">
                {agentProperties.map(item => (
                  <article className="property" key={item.id}>
                    {(item.photo_urls || []).filter(Boolean).length
                      ? <img src={item.photo_urls.filter(Boolean)[0]} alt={item.title} style={{width:'100%',height:'190px',objectFit:'cover'}}/>
                      : <div className="property-image">Property photo unavailable</div>}
                    <div className="property-info">
                      <h4>{item.title}</h4>
                      <p>{[item.area,item.city,item.state].filter(Boolean).join(', ')}</p>
                      <strong>{formatNaira(item.rent_amount)} / year</strong>
                      <button className="portal-submit" onClick={() => {setSelectedAgentProfile(null);setSelectedProperty(item);}}>View Full Details</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {selectedProperty && (() => {
        const photos = (selectedProperty.photo_urls || []).filter(Boolean);
        const index = photos.length ? (photoIndexes[selectedProperty.id] || 0) % photos.length : 0;
        const phone = (selectedProperty.contact_phone || '').replace(/\D/g, '');
        const whatsapp = phone.startsWith('0') ? '234' + phone.slice(1) : phone;
        return (
          <div className="property-details-page" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#fff', overflowY: 'auto', padding: '0', color: '#222' }}>
            <header className="header">
              <BrandLogo name={logoNameDraft} subtitle={logoSubtitleDraft} initials={logoInitialsDraft} />
              <nav className={menuOpen ? 'mobile-nav open' : 'mobile-nav'}>
                <a href="#homes" onClick={() => { if(developerMode && developerAdminVerified)return; setMenuOpen(false); setSelectedProperty(null); }} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("findHomes");setNavLabelDraft(navLabels.findHomes);setNavLabelEditorOpen(true);}}>{navLabels.findHomes}</a>
                <a href="#agents" onClick={() => { if(developerMode && developerAdminVerified)return; setMenuOpen(false); setSelectedProperty(null); }} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("forAgents");setNavLabelDraft(navLabels.forAgents);setNavLabelEditorOpen(true);}}>{navLabels.forAgents}</a>
                <a href="#about" onClick={() => { if(developerMode && developerAdminVerified)return; setMenuOpen(false); setSelectedProperty(null); }} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("about");setNavLabelDraft(navLabels.about);setNavLabelEditorOpen(true);}}>{navLabels.about}</a>
                {dashboardUser ? <>
                  <button className="login" onClick={() => {if(developerMode && developerAdminVerified)return; setMenuOpen(false); setSelectedProperty(null); setShowDashboard(true); }} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("dashboard");setNavLabelDraft(navLabels.dashboard);setNavLabelEditorOpen(true);}}>{navLabels.dashboard}</button>
                  <button className="login" onClick={async () => {if(developerMode && developerAdminVerified)return; setMenuOpen(false); setSelectedProperty(null); await supabase.auth.signOut(); setDashboardUser(null); setShowDashboard(true); }} onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("logout");setNavLabelDraft(navLabels.logout);setNavLabelEditorOpen(true);}}>{navLabels.logout}</button>
                </> : <button className="login" onClick={() => {if(developerMode && developerAdminVerified)return; setMenuOpen(false); setSelectedProperty(null); setPortalMode("login"); }}>
                  <User size={17} /> <span onDoubleClick={e => {if(!developerMode || !developerAdminVerified)return;e.preventDefault();e.stopPropagation();setNavLabelEditorKey("agentLogin");setNavLabelDraft(navLabels.agentLogin);setNavLabelEditorOpen(true);}} title={developerMode && developerAdminVerified ? "Double-click to edit" : undefined}>{navLabels.agentLogin}</span>
                </button>}
              </nav>
              <button className="menu" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                <Menu />
              </button>
            </header>
            <div className="property-details-container">
              <button type="button" className="portal-submit details-back" onClick={() => setSelectedProperty(null)}>← Back to Properties</button>
              <h2 className="details-title">{selectedProperty.title}</h2>
              <p className="location details-location"><MapPin size={16} /> {[selectedProperty.area, selectedProperty.city, selectedProperty.state].filter(Boolean).join(', ')}</p>
              {photos.length ? <>
                <img className="details-main-photo" src={photos[index]} alt={selectedProperty.title}
                  style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', background: '#f3f3f3', borderRadius: '12px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', margin: '10px 0' }}>
                  <button type="button" className="portal-submit" disabled={photos.length < 2}
                    onClick={() => setPhotoIndexes(prev => ({ ...prev, [selectedProperty.id]: (index - 1 + photos.length) % photos.length }))}>Previous</button>
                  <span>{index + 1} / {photos.length}</span>
                  <button type="button" className="portal-submit" disabled={photos.length < 2}
                    onClick={() => setPhotoIndexes(prev => ({ ...prev, [selectedProperty.id]: (index + 1) % photos.length }))}>Next</button>
                </div>
</> : <div className="property-image"><img src="/images/default-house.jpg" alt={`${selectedProperty.title} property`} style={{ width: "100%", maxHeight: "420px", objectFit: "contain", borderRadius: "12px" }} /></div>}
              <div className="features">
                <span><BedDouble size={16} /> {selectedProperty.bedrooms ?? 'Not specified'} Bedrooms</span>
                <span><Bath size={16} /> {selectedProperty.bathrooms ?? 'Not specified'} Bathrooms</span>
                <span>{selectedProperty.property_type || 'Property type not specified'}</span>
              </div>
              <h3>Property Description</h3>
              <p className="details-description">{selectedProperty.description || 'No description provided.'}</p>
              <h3>Full Address</h3>
              <p className="details-address">{[selectedProperty.address, selectedProperty.area, selectedProperty.city, selectedProperty.state].filter(Boolean).join(', ') || 'Address not provided.'}</p>
              <h3>Rent and Fees</h3>
              <div className="public-property-cost details-cost">
                <span>Annual rent: <strong>{formatNaira(selectedProperty.rent_amount)}</strong></span>
                <span>Agreement fee: {formatNaira(selectedProperty.agreement_fee)}</span>
                <span>Agency fee: {formatNaira(selectedProperty.agency_fee)}</span>
                <span>Caution fee: {formatNaira(selectedProperty.caution_fee)}</span>
                <span>First payment total: <strong>{formatNaira(selectedProperty.first_payment_total)}</strong></span>
              </div>
              <h3>Availability</h3>
              <p className="details-availability">{(selectedProperty.availability_status || 'available') === 'available' ? 'Available' : selectedProperty.availability_status === 'rented' ? 'Rented' : 'Currently unavailable'}</p>
              <h3>Contact Agent</h3>
              <div className="public-property-contact">
                {phone && <a href={`tel:${selectedProperty.contact_phone}`}><Phone size={16} /> Call Agent</a>}
                {whatsapp && <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hello, I am interested in ' + selectedProperty.title + ' listed on Kyrios Homes For Rent.')}`} target="_blank" rel="noreferrer">WhatsApp Agent</a>}
              </div>
              {(selectedProperty.availability_status || 'available') === 'available' && <>
                <button type="button" className="portal-submit enquiry-toggle" style={{ marginTop: '16px' }}
                  onClick={() => { setSelectedEnquiry(selectedEnquiry === selectedProperty.id ? null : selectedProperty.id); setEnquiryFeedback(''); }}>
                  {selectedEnquiry === selectedProperty.id ? 'Close Enquiry Form' : 'Send Enquiry'}
                </button>
                {selectedEnquiry === selectedProperty.id && (
                  <form className="customer-request-form" onSubmit={e => submitPropertyEnquiry(e, selectedProperty)}>
                    <h4>Enquire about {selectedProperty.title}</h4>
                    <label>Your full name<input name="customer_name" required maxLength="100" placeholder="Enter your name" /></label>
                    <label>Phone number<input name="customer_phone" type="tel" required maxLength="25" placeholder="Enter your phone number" /></label>
                    <label>Your message<textarea name="message" required maxLength="1500" placeholder="I am interested in this property..." /></label>
                    {enquiryFeedback && <p className="portal-message">{enquiryFeedback}</p>}
                    <button className="portal-submit" disabled={enquirySubmitting}>{enquirySubmitting ? 'Sending...' : 'Submit Enquiry'}</button>
                  </form>
                )}
              </>}
            </div>
            <footer id="about">
              <BrandLogo name={logoNameDraft} subtitle={logoSubtitleDraft} initials={logoInitialsDraft} />
              <p>Helping people find a place to call home.</p>
              <small>© {new Date().getFullYear()} Kyrios Homes For Rent.</small>
            </footer>
          </div>
        );
      })()}

      {!showAdvancedSearchPage && <>
      <section className="housing-request-section" id="housing-request">
        <span className="eyebrow">CAN'T FIND THE RIGHT PROPERTY?</span>
        <h2>Let us help you find a home</h2>
        <p>Send us your requirements and we can follow up with suitable options.</p>

        <form className="customer-request-form housing-request-form" onSubmit={submitHousingRequest}>
          <label>Your full name
            <input name="customer_name" required maxLength="100" placeholder="Enter your name" />
          </label>
          <label>Phone number
            <input name="customer_phone" type="tel" required maxLength="25" placeholder="Enter your phone number" />
          </label>
          <label>State
            <input name="state" required placeholder="e.g. Enugu" />
          </label>
          <label>City
            <input name="city" required placeholder="e.g. Enugu" />
          </label>
          <label>Area or neighbourhood
            <input name="area" placeholder="Preferred area" />
          </label>
          <label>Maximum budget (₦)
            <input name="budget" type="number" min="1" required placeholder="Your budget" />
          </label>
          <label>Property type
            <select name="property_type" required defaultValue="">
              <option value="" disabled>Select property type</option>
              <option value="Self-contained">Self-contained</option>
              <option value="Mini flat">Mini flat</option>
              <option value="Flat">Flat</option>
              <option value="Duplex">Duplex</option>
              <option value="Bungalow">Bungalow</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>Number of bedrooms
            <select name="bedrooms" defaultValue="0">
              <option value="0">Not specified</option>
              <option value="1">1 bedroom</option>
              <option value="2">2 bedrooms</option>
              <option value="3">3 bedrooms</option>
              <option value="4">4 bedrooms</option>
              <option value="5">5 or more bedrooms</option>
            </select>
          </label>
          <label className="request-full-width">Additional requirements
            <textarea name="description" maxLength="1500" placeholder="Describe the kind of home you need..." />
          </label>
          {housingFeedback && <p className="portal-message request-full-width">{housingFeedback}</p>}
          <button className="portal-submit" disabled={housingSubmitting}>
            {housingSubmitting ? 'Submitting...' : 'Submit Housing Request'}
          </button>
        </form>
      </section>

      <section className="agent-section" id="agents">
        <div><span className="eyebrow">FOR PROPERTY AGENTS</span><h2>List properties. Reach more people.</h2><p>Join Kyrios Homes For Rent and connect your available properties with people searching for homes.</p></div>
        <button onClick={() => setPortalMode("register")}>Become an Agent <ArrowRight size={17} /></button>
      </section>

      <footer id="about"><BrandLogo name={logoNameDraft} subtitle={logoSubtitleDraft} initials={logoInitialsDraft} />
      {adPrivacyOptionsRequired && (
        <button
          type="button"
          className="ad-privacy-options"
          onClick={async () => {
            try {
              await AdMob.showPrivacyOptionsForm();
            } catch (error) {
              console.error('AdMob privacy options error:', error);
            }
          }}
        >
          Privacy options
        </button>
      )}
      <p>Helping people find a place to call home.</p><small>© {new Date().getFullYear()} Kyrios Homes For Rent.</small></footer>
      </>}
        </>
      )}
    </main>
  );
}

export default App;
