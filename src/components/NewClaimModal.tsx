import { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Search, 
  Shield, 
  Check, 
  AlertCircle,
  MapPin,
  User,
  Briefcase,
  Building2,
  Scale
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { appSettingsService } from '../lib/appSettingsService';
import { 
  formatPhoneAsYouType, 
  isValidPhone, 
  isValidEmail, 
  formatZipCode, 
  formatClaimNumber 
} from '../lib/formatters';
import type { Insured, PublicAdjuster, CarrierRepresentative, ExternalActor, Claim } from '../types';

const DEFAULT_CARRIERS = [
  'Citizens Property Insurance',
  'State Farm Florida',
  'Heritage Property & Casualty',
  'Universal Property & Casualty',
  "People's Trust Insurance",
  'Florida Peninsula Insurance',
  'Tower Hill Insurance',
  'Security First Insurance',
  'Castle Key Insurance',
  'Olympus Insurance',
  'TypTap Insurance',
  'Slide Insurance',
  'American Integrity Insurance',
  'Kin Insurance',
  'Frontline Insurance',
];

const STORAGE_KEY_CARRIERS = 'ip_adjusters_saved_carriers';

interface NewClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClaimCreated: (createdClaim?: any) => void;
  claimToEdit?: Claim | null;
}

export function NewClaimModal({ isOpen, onClose, onClaimCreated, claimToEdit }: NewClaimModalProps) {
  // Existing directories loaded from Supabase
  const [existingInsureds, setExistingInsureds] = useState<Insured[]>([]);
  const [existingPas, setExistingPas] = useState<PublicAdjuster[]>([]);
  const [existingCarrierReps, setExistingCarrierReps] = useState<CarrierRepresentative[]>([]);
  const [existingExternalActors, setExistingExternalActors] = useState<ExternalActor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Carrier Catalog State
  const [availableCarriers, setAvailableCarriers] = useState<string[]>(DEFAULT_CARRIERS);
  const [carrier, setCarrier] = useState('Citizens Property Insurance');
  const [isCustomCarrier, setIsCustomCarrier] = useState(false);
  const [customCarrierInput, setCustomCarrierInput] = useState('');

  // Claim & Property Form State
  const [claimNumber, setClaimNumber] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [claimStatus, setClaimStatus] = useState<'Open' | 'Under Review' | 'Appraisal' | 'Settled' | 'Closed'>('Open');
  const [typeOfLoss, setTypeOfLoss] = useState('Water Damage');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [city, setCity] = useState('Miami');
  const [state, setState] = useState('FL');
  const [zipCode, setZipCode] = useState('');
  const [dateOfLoss, setDateOfLoss] = useState('');
  const [claimNotes, setClaimNotes] = useState('');

  // 1. INSURED STATE
  const [insuredMode, setInsuredMode] = useState<'search' | 'create'>('search');
  const [insuredSearch, setInsuredSearch] = useState('');
  const [selectedInsured, setSelectedInsured] = useState<Insured | null>(null);
  const [showInsuredDropdown, setShowInsuredDropdown] = useState(false);
  const [newInsuredName, setNewInsuredName] = useState('');
  const [newInsuredPhone, setNewInsuredPhone] = useState('');
  const [newInsuredEmail, setNewInsuredEmail] = useState('');
  const [newInsuredAvailability, setNewInsuredAvailability] = useState('');
  const [newInsuredNotes, setNewInsuredNotes] = useState('');

  // 2. PUBLIC ADJUSTER (PA) STATE
  const [paMode, setPaMode] = useState<'search' | 'create'>('search');
  const [paSearch, setPaSearch] = useState('');
  const [selectedPa, setSelectedPa] = useState<PublicAdjuster | null>(null);
  const [showPaDropdown, setShowPaDropdown] = useState(false);
  const [newPaName, setNewPaName] = useState('');
  const [newPaRole, setNewPaRole] = useState('adjuster');
  const [newPaPhone, setNewPaPhone] = useState('');
  const [newPaEmail, setNewPaEmail] = useState('');
  const [newPaAvailability, setNewPaAvailability] = useState('');
  const [newPaColor, setNewPaColor] = useState('#0284c7');

  // 3. CARRIER REP STATE
  const [carrierRepMode, setCarrierRepMode] = useState<'search' | 'create'>('search');
  const [carrierRepSearch, setCarrierRepSearch] = useState('');
  const [selectedCarrierRep, setSelectedCarrierRep] = useState<CarrierRepresentative | null>(null);
  const [showRepDropdown, setShowRepDropdown] = useState(false);
  const [newRepName, setNewRepName] = useState('');
  const [newRepType, setNewRepType] = useState('Field Adjuster');
  const [newRepPhone, setNewRepPhone] = useState('');
  const [newRepEmail, setNewRepEmail] = useState('');
  const [newRepCompany, setNewRepCompany] = useState('');

  // 4. EXTERNAL ACTOR STATE
  const [externalActorMode, setExternalActorMode] = useState<'search' | 'create'>('search');
  const [externalActorSearch, setExternalActorSearch] = useState('');
  const [selectedExternalActor, setSelectedExternalActor] = useState<ExternalActor | null>(null);
  const [showExtDropdown, setShowExtDropdown] = useState(false);
  const [newExtName, setNewExtName] = useState('');
  const [newExtType, setNewExtType] = useState('Appraiser');
  const [newExtCompany, setNewExtCompany] = useState('');
  const [newExtPhone, setNewExtPhone] = useState('');
  const [newExtEmail, setNewExtEmail] = useState('');

  // Refs for closing dropdowns when clicking outside
  const insuredRef = useRef<HTMLDivElement>(null);
  const paRef = useRef<HTMLDivElement>(null);
  const repRef = useRef<HTMLDivElement>(null);
  const extRef = useRef<HTMLDivElement>(null);

  // Load existing directories and carriers when opening (or editing)
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setIsCustomCarrier(false);
    setCustomCarrierInput('');

    if (claimToEdit) {
      setCarrier(claimToEdit.carrier || 'Citizens Property Insurance');
      setClaimNumber(claimToEdit.claimNumber || '');
      setPolicyNumber(claimToEdit.policyNumber || '');
      setClaimStatus(claimToEdit.status || 'Open');
      setTypeOfLoss(claimToEdit.typeOfLoss || 'Water Damage');
      setPropertyAddress(claimToEdit.propertyAddress || '');
      setCity(claimToEdit.city || 'Miami');
      setState(claimToEdit.state || 'FL');
      setZipCode(claimToEdit.zipCode || '');
      setDateOfLoss(claimToEdit.dateOfLoss || '');
      setClaimNotes(claimToEdit.notes || '');

      setInsuredMode('search');
      setSelectedInsured(claimToEdit.insured || null);

      setPaMode('search');
      setSelectedPa(claimToEdit.publicAdjuster || null);

      setCarrierRepMode('search');
      setSelectedCarrierRep(claimToEdit.carrierReps?.[0] || null);

      setExternalActorMode('search');
      setSelectedExternalActor(claimToEdit.externalActors?.[0] || null);
    } else {
      setCarrier('Citizens Property Insurance');
      setClaimNumber('');
      setPolicyNumber('');
      setClaimStatus('Open');
      setTypeOfLoss('Water Damage');
      setPropertyAddress('');
      setCity('Miami');
      setState('FL');
      setZipCode('');
      setDateOfLoss('');
      setClaimNotes('');
      setInsuredMode('search');
      setSelectedInsured(null);
      setPaMode('search');
      setSelectedPa(null);
      setCarrierRepMode('search');
      setSelectedCarrierRep(null);
      setExternalActorMode('search');
      setSelectedExternalActor(null);
    }

    // Load custom carriers from localStorage
    let savedCarriers: string[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CARRIERS);
      if (stored) {
        savedCarriers = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse saved carriers:', e);
    }

    Promise.all([
      schedulingService.getInsureds(),
      schedulingService.getPublicAdjusters(),
      schedulingService.getCarrierReps(),
      schedulingService.getExternalActors(),
      schedulingService.getUniqueCarriers(),
      appSettingsService.getCustomCarriers(),
    ]).then(([insureds, pas, reps, externals, dbCarriers, customDbCarriers]) => {
      setExistingInsureds(insureds);
      setExistingPas(pas);
      setExistingCarrierReps(reps);
      setExistingExternalActors(externals);

      if (claimToEdit) {
        if (!claimToEdit.insured && claimToEdit.insuredId) {
          const matchInsured = insureds.find(i => i.id === claimToEdit.insuredId);
          if (matchInsured) setSelectedInsured(matchInsured);
        }
        if (!claimToEdit.publicAdjuster && claimToEdit.publicAdjusterId) {
          const matchPa = pas.find(p => p.id === claimToEdit.publicAdjusterId);
          if (matchPa) setSelectedPa(matchPa);
        }
        if (claimToEdit.carrierReps?.[0]) {
          setSelectedCarrierRep(claimToEdit.carrierReps[0]);
        }
        if (claimToEdit.externalActors?.[0]) {
          setSelectedExternalActor(claimToEdit.externalActors[0]);
        }
      }

      const mergedCarriers = Array.from(new Set([...DEFAULT_CARRIERS, ...customDbCarriers, ...savedCarriers, ...dbCarriers, claimToEdit?.carrier].filter(Boolean)))
        .sort((a, b) => (a as string).localeCompare(b as string)) as string[];
      setAvailableCarriers(mergedCarriers);
    }).catch(console.error);
  }, [isOpen, claimToEdit]);

  // Click outside listener for autocomplete dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (insuredRef.current && !insuredRef.current.contains(target)) {
        setShowInsuredDropdown(false);
      }
      if (paRef.current && !paRef.current.contains(target)) {
        setShowPaDropdown(false);
      }
      if (repRef.current && !repRef.current.contains(target)) {
        setShowRepDropdown(false);
      }
      if (extRef.current && !extRef.current.contains(target)) {
        setShowExtDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Filtered lists for autocomplete search
  const filteredInsureds = existingInsureds.filter(i => 
    i.name.toLowerCase().includes(insuredSearch.toLowerCase()) ||
    (i.phone && i.phone.includes(insuredSearch))
  );

  const filteredPas = existingPas.filter(p => 
    p.name.toLowerCase().includes(paSearch.toLowerCase()) ||
    p.role.toLowerCase().includes(paSearch.toLowerCase())
  );

  const filteredCarrierReps = existingCarrierReps.filter(r =>
    r.name.toLowerCase().includes(carrierRepSearch.toLowerCase()) ||
    r.carrierName.toLowerCase().includes(carrierRepSearch.toLowerCase())
  );

  const filteredExternalActors = existingExternalActors.filter(a =>
    a.name.toLowerCase().includes(externalActorSearch.toLowerCase()) ||
    (a.company && a.company.toLowerCase().includes(externalActorSearch.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      // Validation: Primary Claim Info
      if (!claimNumber.trim()) {
        throw new Error('Claim number is required');
      }
      if (!propertyAddress.trim()) {
        throw new Error('Property address is required');
      }
      if (zipCode.trim() && zipCode.replace(/\D/g, '').length < 5) {
        throw new Error('Please enter a valid 5-digit US Zip Code');
      }

      // 0. Resolve Carrier
      let finalCarrier = carrier;
      if (isCustomCarrier) {
        const trimmed = customCarrierInput.trim();
        if (!trimmed) {
          throw new Error('Please enter the name of the insurance carrier');
        }
        finalCarrier = trimmed;
        // Permanently persist new carrier to database and local cache
        const updated = Array.from(new Set([...availableCarriers, finalCarrier])).sort((a, b) => a.localeCompare(b));
        setAvailableCarriers(updated);
        setCarrier(finalCarrier);
        appSettingsService.addCustomCarrier(finalCarrier).catch(console.warn);
        try {
          const currentSaved = JSON.parse(localStorage.getItem(STORAGE_KEY_CARRIERS) || '[]');
          localStorage.setItem(STORAGE_KEY_CARRIERS, JSON.stringify(Array.from(new Set([...currentSaved, finalCarrier]))));
        } catch (err) {
          console.warn('Failed to save carrier to localStorage:', err);
        }
      }

      // 1. Resolve Insured ID
      let finalInsuredId = selectedInsured?.id;
      if (insuredMode === 'create') {
        if (!newInsuredName.trim()) {
          throw new Error('Insured client full name is required');
        }
        if (newInsuredPhone.trim() && !isValidPhone(newInsuredPhone)) {
          throw new Error('Please enter a valid 10-digit phone number for the Insured (e.g. (305) 555-0123)');
        }
        if (newInsuredEmail.trim() && !isValidEmail(newInsuredEmail)) {
          throw new Error('Please enter a valid email address for the Insured (e.g. client@example.com)');
        }
        const created = await schedulingService.createInsured({
          name: newInsuredName.trim(),
          phone: newInsuredPhone.trim(),
          email: newInsuredEmail.trim(),
          generalAvailability: newInsuredAvailability.trim(),
          notes: newInsuredNotes.trim(),
        });
        finalInsuredId = created.id;
      }

      if (!finalInsuredId) {
        throw new Error('Please select an Insured client or create a new one');
      }

      // 2. Resolve Public Adjuster ID
      let finalPaId = selectedPa?.id;
      if (paMode === 'create' && newPaName.trim()) {
        if (newPaPhone.trim() && !isValidPhone(newPaPhone)) {
          throw new Error('Please enter a valid 10-digit phone number for the Public Adjuster');
        }
        if (newPaEmail.trim() && !isValidEmail(newPaEmail)) {
          throw new Error('Please enter a valid email address for the Public Adjuster');
        }
        const createdPa = await schedulingService.createPublicAdjuster({
          name: newPaName.trim(),
          role: newPaRole,
          phone: newPaPhone.trim(),
          email: newPaEmail.trim(),
          generalAvailability: newPaAvailability.trim(),
          colorCode: newPaColor,
        });
        finalPaId = createdPa.id;
      }

      // 3. Resolve Carrier Rep ID
      let finalCarrierRepId = selectedCarrierRep?.id;
      if (carrierRepMode === 'create' && newRepName.trim()) {
        if (newRepPhone.trim() && !isValidPhone(newRepPhone)) {
          throw new Error('Please enter a valid 10-digit phone number for the Carrier Representative');
        }
        if (newRepEmail.trim() && !isValidEmail(newRepEmail)) {
          throw new Error('Please enter a valid email address for the Carrier Representative');
        }
        const createdRep = await schedulingService.createCarrierRep({
          carrierName: finalCarrier,
          name: newRepName.trim(),
          typeOfRepresentative: newRepType,
          phone: newRepPhone.trim(),
          email: newRepEmail.trim(),
          company: newRepCompany.trim() || finalCarrier,
        });
        finalCarrierRepId = createdRep.id;
      }

      // 4. Resolve External Actor ID
      let finalExternalActorId = selectedExternalActor?.id;
      if (externalActorMode === 'create' && newExtName.trim()) {
        if (newExtPhone.trim() && !isValidPhone(newExtPhone)) {
          throw new Error('Please enter a valid 10-digit phone number for the External Actor');
        }
        if (newExtEmail.trim() && !isValidEmail(newExtEmail)) {
          throw new Error('Please enter a valid email address for the External Actor');
        }
        const createdExt = await schedulingService.createExternalActor({
          name: newExtName.trim(),
          typeOfActor: newExtType,
          company: newExtCompany.trim(),
          phone: newExtPhone.trim(),
          email: newExtEmail.trim(),
        });
        finalExternalActorId = createdExt.id;
      }

      // 5. Create or Update Claim in Supabase
      if (claimToEdit) {
        const updatedClaim = await schedulingService.updateClaim(claimToEdit.id, {
          insuredId: finalInsuredId,
          carrier: finalCarrier,
          claimNumber: claimNumber.trim(),
          policyNumber: policyNumber.trim(),
          typeOfLoss,
          propertyAddress: propertyAddress.trim(),
          city: city.trim(),
          state: state.trim() || 'FL',
          zipCode: zipCode.trim(),
          dateOfLoss: dateOfLoss || undefined,
          status: claimStatus,
          notes: claimNotes.trim(),
          publicAdjusterId: finalPaId,
          carrierRepId: finalCarrierRepId,
          externalActorId: finalExternalActorId,
        });

        onClaimCreated(updatedClaim);
      } else {
        const createdClaim = await schedulingService.createClaim({
          insuredId: finalInsuredId,
          carrier: finalCarrier,
          claimNumber: claimNumber.trim(),
          policyNumber: policyNumber.trim(),
          typeOfLoss,
          propertyAddress: propertyAddress.trim(),
          city: city.trim(),
          state: state.trim() || 'FL',
          zipCode: zipCode.trim(),
          dateOfLoss: dateOfLoss || undefined,
          status: claimStatus,
          notes: claimNotes.trim(),
          publicAdjusterId: finalPaId,
          carrierRepId: finalCarrierRepId,
          externalActorId: finalExternalActorId,
        });

        onClaimCreated(createdClaim);
      }

      onClose();
    } catch (err: any) {
      console.error('Error saving claim:', err);
      setErrorMsg(err.message || 'Failed to save claim');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 overflow-hidden">
      <div className="bg-white border border-slate-300 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl text-slate-900">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon-800 text-white flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5 text-tealBrand-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {claimToEdit ? `Edit Claim: ${claimToEdit.claimNumber}` : 'Enter New Claim'}
              </h2>
              <p className="text-xs text-slate-500">
                {claimToEdit ? 'Modify claim details, property information, or assigned actors' : 'Record claim record, policyholder, and assigned coordination actors'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body: Horizontal 2-Column Split */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              
              {/* ======================================================== */}
              {/* LEFT COLUMN: CLAIM & PROPERTY INFORMATION */}
              {/* ======================================================== */}
              <div className="space-y-4">
                
                {/* Section A: Claim & Insurance Details */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3.5">
                  <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-maroon-100 text-maroon-800 inline-flex items-center justify-center text-[11px] font-bold">1</span>
                    Claim & Policy Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Insurance Carrier <span className="text-red-500">*</span>
                        </label>
                        {!isCustomCarrier ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomCarrier(true);
                              setCustomCarrierInput('');
                            }}
                            className="text-[11px] text-tealBrand-700 hover:text-tealBrand-800 font-bold hover:underline"
                          >
                            + Add Custom Carrier
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomCarrier(false);
                            }}
                            className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold"
                          >
                            Pick from list
                          </button>
                        )}
                      </div>

                      {!isCustomCarrier ? (
                        <select
                          value={carrier}
                          onChange={(e) => {
                            if (e.target.value === '__OTHER__') {
                              setIsCustomCarrier(true);
                              setCustomCarrierInput('');
                            } else {
                              setCarrier(e.target.value);
                            }
                          }}
                          required
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                        >
                          {availableCarriers.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value="__OTHER__">+ Other / Enter New Carrier...</option>
                        </select>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              required
                              autoFocus
                              placeholder="Type new carrier name (e.g. Progressive Home, ASI...)"
                              value={customCarrierInput}
                              onChange={(e) => setCustomCarrierInput(e.target.value)}
                              className="flex-1 bg-white border border-maroon-800 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-maroon-800"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const trimmed = customCarrierInput.trim();
                                if (trimmed) {
                                  const updated = Array.from(new Set([...availableCarriers, trimmed])).sort((a, b) => a.localeCompare(b));
                                  setAvailableCarriers(updated);
                                  setCarrier(trimmed);
                                  setIsCustomCarrier(false);
                                  appSettingsService.addCustomCarrier(trimmed).catch(console.warn);
                                  try {
                                    const currentSaved = JSON.parse(localStorage.getItem(STORAGE_KEY_CARRIERS) || '[]');
                                    localStorage.setItem(STORAGE_KEY_CARRIERS, JSON.stringify(Array.from(new Set([...currentSaved, trimmed]))));
                                  } catch (err) {
                                    console.warn('Failed to save carrier to localStorage:', err);
                                  }
                                } else {
                                  setIsCustomCarrier(false);
                                }
                              }}
                              className="px-3 py-2 text-xs font-bold bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg transition-colors shrink-0"
                            >
                              Save Carrier
                            </button>
                          </div>
                          <p className="text-[10px] text-tealBrand-800 font-medium">
                            ✓ This carrier will be remembered automatically for future claims.
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Claim Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. CLM-2026-0819"
                        value={claimNumber}
                        onChange={(e) => setClaimNumber(formatClaimNumber(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Policy Number</label>
                      <input
                        type="text"
                        placeholder="e.g. POL-FL-99382"
                        value={policyNumber}
                        onChange={(e) => setPolicyNumber(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Claim Status <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={claimStatus}
                        onChange={(e) => setClaimStatus(e.target.value as any)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-maroon-800"
                      >
                        <option value="Open">Open</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Appraisal">Appraisal</option>
                        <option value="Settled">Settled</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Type of Loss <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={typeOfLoss}
                        onChange={(e) => setTypeOfLoss(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      >
                        <option value="Water Damage">Water Damage</option>
                        <option value="Fire & Smoke">Fire & Smoke</option>
                        <option value="Hurricane / Wind">Hurricane / Wind</option>
                        <option value="Hail / Roof">Hail / Roof</option>
                        <option value="Plumbing Burst">Plumbing Burst</option>
                        <option value="Mold Damage">Mold Damage</option>
                        <option value="Vandalism / Theft">Vandalism / Theft</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Loss</label>
                      <input
                        type="date"
                        value={dateOfLoss}
                        onChange={(e) => setDateOfLoss(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>
                </div>

                {/* Section B: Property Location & Address */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3.5">
                  <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-maroon-800" />
                    Property Address & Location
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Street Address <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. 1420 Brickell Ave, Apt 18B"
                          value={propertyAddress}
                          onChange={(e) => setPropertyAddress(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-2.5">
                      <div className="col-span-3">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                        <input
                          type="text"
                          placeholder="e.g. Miami"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                        />
                      </div>

                      <div className="col-span-1">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                        <input
                          type="text"
                          maxLength={2}
                          placeholder="FL"
                          value={state}
                          onChange={(e) => setState(e.target.value.toUpperCase())}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-xs text-center text-slate-900 uppercase font-semibold focus:outline-none focus:border-maroon-800"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Zip Code</label>
                        <input
                          type="text"
                          placeholder="e.g. 33131"
                          value={zipCode}
                          maxLength={10}
                          onChange={(e) => setZipCode(formatZipCode(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section C: Claim Notes */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-bold text-maroon-800 uppercase tracking-wider">
                    Claim Notes / Access Details
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Gate codes, lockbox number, pets, coordinator instructions, etc."
                    value={claimNotes}
                    onChange={(e) => setClaimNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                  />
                </div>

              </div>

              {/* ======================================================== */}
              {/* RIGHT COLUMN: ASSIGNED PARTIES & ACTORS */}
              {/* ======================================================== */}
              <div className="space-y-4">
                
                {/* 1. INSURED (POLICYHOLDER CLIENT) */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3" ref={insuredRef}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-2">
                      <User className="w-4 h-4 text-maroon-800" />
                      Insured (Policyholder) <span className="text-red-500">*</span>
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setInsuredMode('search'); setSelectedInsured(null); setInsuredSearch(''); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          insuredMode === 'search' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        Search
                      </button>
                      <button
                        type="button"
                        onClick={() => { setInsuredMode('create'); setSelectedInsured(null); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          insuredMode === 'create' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        + New
                      </button>
                    </div>
                  </div>

                  {insuredMode === 'search' && (
                    <div>
                      {selectedInsured ? (
                        <div className="p-2.5 bg-tealBrand-50 border border-tealBrand-200 rounded-lg flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{selectedInsured.name}</span>
                              <span className="text-[10px] bg-tealBrand-200 text-tealBrand-800 px-1.5 py-0.2 rounded font-semibold">Selected</span>
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              📞 {selectedInsured.phone || 'No phone'} · ✉️ {selectedInsured.email || 'No email'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedInsured(null); setInsuredSearch(''); }}
                            className="text-xs text-red-600 hover:underline font-semibold shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Type client name or phone to search..."
                            value={insuredSearch}
                            onFocus={() => setShowInsuredDropdown(true)}
                            onChange={(e) => {
                              setInsuredSearch(e.target.value);
                              setShowInsuredDropdown(true);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                          />

                          {/* Floating Dropdown: Only shown when searching */}
                          {showInsuredDropdown && insuredSearch.trim().length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-44 overflow-y-auto z-30 divide-y divide-slate-100">
                              {filteredInsureds.length === 0 ? (
                                <div className="p-2.5 text-center text-xs text-slate-500">
                                  No clients found.{' '}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInsuredMode('create');
                                      setNewInsuredName(insuredSearch);
                                      setShowInsuredDropdown(false);
                                    }}
                                    className="text-tealBrand-700 font-bold hover:underline"
                                  >
                                    Add as new
                                  </button>
                                </div>
                              ) : (
                                filteredInsureds.map((ins) => (
                                  <div
                                    key={ins.id}
                                    onClick={() => {
                                      setSelectedInsured(ins);
                                      setShowInsuredDropdown(false);
                                      setInsuredSearch('');
                                    }}
                                    className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                                  >
                                    <div>
                                      <strong className="text-slate-900">{ins.name}</strong>
                                      {ins.phone && <span className="text-slate-500 ml-2">({ins.phone})</span>}
                                    </div>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Select</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {insuredMode === 'create' && (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Full Name *</label>
                          <input
                            type="text"
                            placeholder="Client name"
                            value={newInsuredName}
                            onChange={(e) => setNewInsuredName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Phone</label>
                          <input
                            type="text"
                            placeholder="(305) 555-0123"
                            value={newInsuredPhone}
                            onChange={(e) => setNewInsuredPhone(formatPhoneAsYouType(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Email</label>
                          <input
                            type="email"
                            placeholder="email@client.com"
                            value={newInsuredEmail}
                            onChange={(e) => setNewInsuredEmail(e.target.value.toLowerCase().trim())}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Availability</label>
                          <input
                            type="text"
                            placeholder="e.g. Weekdays after 2 PM"
                            value={newInsuredAvailability}
                            onChange={(e) => setNewInsuredAvailability(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Special Instructions / Notes</label>
                          <input
                            type="text"
                            placeholder="e.g. Call before arriving, guard dogs"
                            value={newInsuredNotes}
                            onChange={(e) => setNewInsuredNotes(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. PUBLIC ADJUSTER (ASSIGNED PA) */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3" ref={paRef}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-maroon-800" />
                      Assigned Public Adjuster (PA)
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setPaMode('search'); setSelectedPa(null); setPaSearch(''); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          paMode === 'search' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        Search
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPaMode('create'); setSelectedPa(null); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          paMode === 'create' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        + New
                      </button>
                    </div>
                  </div>

                  {paMode === 'search' && (
                    <div>
                      {selectedPa ? (
                        <div className="p-2.5 bg-tealBrand-50 border border-tealBrand-200 rounded-lg flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedPa.colorCode }} />
                              <span className="text-xs font-bold text-slate-900 truncate">{selectedPa.name}</span>
                              <span className="text-[10px] bg-tealBrand-200 text-tealBrand-800 px-1.5 py-0.2 rounded font-semibold capitalize">
                                {selectedPa.role.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              📞 {selectedPa.phone || 'No phone'} · ✉️ {selectedPa.email || 'No email'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedPa(null); setPaSearch(''); }}
                            className="text-xs text-red-600 hover:underline font-semibold shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Type adjuster name to search..."
                            value={paSearch}
                            onFocus={() => setShowPaDropdown(true)}
                            onChange={(e) => {
                              setPaSearch(e.target.value);
                              setShowPaDropdown(true);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                          />

                          {/* Floating Dropdown: Only shown when searching */}
                          {showPaDropdown && paSearch.trim().length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-44 overflow-y-auto z-30 divide-y divide-slate-100">
                              {filteredPas.length === 0 ? (
                                <div className="p-2.5 text-center text-xs text-slate-500">
                                  No public adjusters found.{' '}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPaMode('create');
                                      setNewPaName(paSearch);
                                      setShowPaDropdown(false);
                                    }}
                                    className="text-tealBrand-700 font-bold hover:underline"
                                  >
                                    Add as new
                                  </button>
                                </div>
                              ) : (
                                filteredPas.map((pa) => (
                                  <div
                                    key={pa.id}
                                    onClick={() => {
                                      setSelectedPa(pa);
                                      setShowPaDropdown(false);
                                      setPaSearch('');
                                    }}
                                    className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pa.colorCode }} />
                                      <strong className="text-slate-900">{pa.name}</strong>
                                      <span className="text-slate-500 text-[11px] capitalize">({pa.role.replace('_', ' ')})</span>
                                    </div>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Select</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {paMode === 'create' && (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Name *</label>
                          <input
                            type="text"
                            placeholder="Adjuster name"
                            value={newPaName}
                            onChange={(e) => setNewPaName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Role</label>
                          <select
                            value={newPaRole}
                            onChange={(e) => setNewPaRole(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          >
                            <option value="adjuster">Public Adjuster</option>
                            <option value="senior_adjuster">Senior Adjuster</option>
                            <option value="director">Director</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Color Tag</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={newPaColor}
                              onChange={(e) => setNewPaColor(e.target.value)}
                              className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                            />
                            <span className="text-[11px] font-mono text-slate-600">{newPaColor}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Phone</label>
                          <input
                            type="text"
                            placeholder="(305) 555-0123"
                            value={newPaPhone}
                            onChange={(e) => setNewPaPhone(formatPhoneAsYouType(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Email</label>
                          <input
                            type="email"
                            placeholder="adjuster@firm.com"
                            value={newPaEmail}
                            onChange={(e) => setNewPaEmail(e.target.value.toLowerCase().trim())}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">General Availability</label>
                        <input
                          type="text"
                          placeholder="e.g. Mon-Fri mornings, Miami-Dade area"
                          value={newPaAvailability}
                          onChange={(e) => setNewPaAvailability(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. CARRIER REPRESENTATIVE */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3" ref={repRef}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-maroon-800" />
                      Carrier Representative
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setCarrierRepMode('search'); setSelectedCarrierRep(null); setCarrierRepSearch(''); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          carrierRepMode === 'search' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        Search
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCarrierRepMode('create'); setSelectedCarrierRep(null); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          carrierRepMode === 'create' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        + New
                      </button>
                    </div>
                  </div>

                  {carrierRepMode === 'search' && (
                    <div>
                      {selectedCarrierRep ? (
                        <div className="p-2.5 bg-tealBrand-50 border border-tealBrand-200 rounded-lg flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{selectedCarrierRep.name}</span>
                              <span className="text-[10px] bg-tealBrand-200 text-tealBrand-800 px-1.5 py-0.2 rounded font-semibold truncate">
                                {selectedCarrierRep.carrierName} ({selectedCarrierRep.typeOfRepresentative})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              📞 {selectedCarrierRep.phone || 'No phone'} · ✉️ {selectedCarrierRep.email || 'No email'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedCarrierRep(null); setCarrierRepSearch(''); }}
                            className="text-xs text-red-600 hover:underline font-semibold shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Type carrier adjuster or firm name to search..."
                            value={carrierRepSearch}
                            onFocus={() => setShowRepDropdown(true)}
                            onChange={(e) => {
                              setCarrierRepSearch(e.target.value);
                              setShowRepDropdown(true);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                          />

                          {/* Floating Dropdown: Only shown when searching */}
                          {showRepDropdown && carrierRepSearch.trim().length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-44 overflow-y-auto z-30 divide-y divide-slate-100">
                              {filteredCarrierReps.length === 0 ? (
                                <div className="p-2.5 text-center text-xs text-slate-500">
                                  No carrier representatives found.{' '}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCarrierRepMode('create');
                                      setNewRepName(carrierRepSearch);
                                      setShowRepDropdown(false);
                                    }}
                                    className="text-tealBrand-700 font-bold hover:underline"
                                  >
                                    Add as new
                                  </button>
                                </div>
                              ) : (
                                filteredCarrierReps.map((rep) => (
                                  <div
                                    key={rep.id}
                                    onClick={() => {
                                      setSelectedCarrierRep(rep);
                                      setShowRepDropdown(false);
                                      setCarrierRepSearch('');
                                    }}
                                    className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                                  >
                                    <div>
                                      <strong className="text-slate-900">{rep.name}</strong>
                                      <span className="text-slate-500 ml-2 font-mono text-[11px]">({rep.carrierName})</span>
                                    </div>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Select</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {carrierRepMode === 'create' && (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Rep Name *</label>
                          <input
                            type="text"
                            placeholder="Rep name"
                            value={newRepName}
                            onChange={(e) => setNewRepName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Role Type</label>
                          <select
                            value={newRepType}
                            onChange={(e) => setNewRepType(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          >
                            <option value="Field Adjuster">Field Adjuster</option>
                            <option value="Desk Adjuster">Desk Adjuster</option>
                            <option value="Independent Adjuster">Independent Adjuster</option>
                            <option value="Carrier Engineer">Carrier Engineer</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Company / Firm</label>
                          <input
                            type="text"
                            placeholder={carrier}
                            value={newRepCompany}
                            onChange={(e) => setNewRepCompany(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Phone</label>
                          <input
                            type="text"
                            placeholder="(305) 555-0123"
                            value={newRepPhone}
                            onChange={(e) => setNewRepPhone(formatPhoneAsYouType(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Email</label>
                          <input
                            type="email"
                            placeholder="rep@carrier.com"
                            value={newRepEmail}
                            onChange={(e) => setNewRepEmail(e.target.value.toLowerCase().trim())}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. EXTERNAL ACTOR (APPRAISER / UMPIRE) */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3" ref={extRef}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-maroon-800 uppercase tracking-wider flex items-center gap-2">
                      <Scale className="w-4 h-4 text-maroon-800" />
                      External Actor (Optional)
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setExternalActorMode('search'); setSelectedExternalActor(null); setExternalActorSearch(''); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          externalActorMode === 'search' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        Search
                      </button>
                      <button
                        type="button"
                        onClick={() => { setExternalActorMode('create'); setSelectedExternalActor(null); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          externalActorMode === 'create' 
                            ? 'bg-maroon-800 text-white' 
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        + New
                      </button>
                    </div>
                  </div>

                  {externalActorMode === 'search' && (
                    <div>
                      {selectedExternalActor ? (
                        <div className="p-2.5 bg-tealBrand-50 border border-tealBrand-200 rounded-lg flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{selectedExternalActor.name}</span>
                              <span className="text-[10px] bg-tealBrand-200 text-tealBrand-800 px-1.5 py-0.2 rounded font-semibold truncate">
                                {selectedExternalActor.typeOfActor} ({selectedExternalActor.company || 'Independent'})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              📞 {selectedExternalActor.phone || 'No phone'} · ✉️ {selectedExternalActor.email || 'No email'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedExternalActor(null); setExternalActorSearch(''); }}
                            className="text-xs text-red-600 hover:underline font-semibold shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Type appraiser, umpire, or engineer name to search..."
                            value={externalActorSearch}
                            onFocus={() => setShowExtDropdown(true)}
                            onChange={(e) => {
                              setExternalActorSearch(e.target.value);
                              setShowExtDropdown(true);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-maroon-800"
                          />

                          {/* Floating Dropdown: Only shown when searching */}
                          {showExtDropdown && externalActorSearch.trim().length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-44 overflow-y-auto z-30 divide-y divide-slate-100">
                              {filteredExternalActors.length === 0 ? (
                                <div className="p-2.5 text-center text-xs text-slate-500">
                                  No external actors found.{' '}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExternalActorMode('create');
                                      setNewExtName(externalActorSearch);
                                      setShowExtDropdown(false);
                                    }}
                                    className="text-tealBrand-700 font-bold hover:underline"
                                  >
                                    Add as new
                                  </button>
                                </div>
                              ) : (
                                filteredExternalActors.map((act) => (
                                  <div
                                    key={act.id}
                                    onClick={() => {
                                      setSelectedExternalActor(act);
                                      setShowExtDropdown(false);
                                      setExternalActorSearch('');
                                    }}
                                    className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                                  >
                                    <div>
                                      <strong className="text-slate-900">{act.name}</strong>
                                      <span className="text-tealBrand-700 ml-2 font-semibold">({act.typeOfActor})</span>
                                      {act.company && <span className="text-slate-400 ml-1">· {act.company}</span>}
                                    </div>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Select</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {externalActorMode === 'create' && (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Name *</label>
                          <input
                            type="text"
                            placeholder="Actor name"
                            value={newExtName}
                            onChange={(e) => setNewExtName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Role Type</label>
                          <select
                            value={newExtType}
                            onChange={(e) => setNewExtType(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          >
                            <option value="Appraiser">Appraiser</option>
                            <option value="Umpire">Umpire</option>
                            <option value="Structural Engineer">Structural Engineer</option>
                            <option value="Roofer / Contractor">Roofer / Contractor</option>
                            <option value="Leak Detection">Leak Detection</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Company</label>
                          <input
                            type="text"
                            placeholder="Firm name"
                            value={newExtCompany}
                            onChange={(e) => setNewExtCompany(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-maroon-800"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Phone</label>
                          <input
                            type="text"
                            placeholder="(305) 000-0000"
                            value={newExtPhone}
                            onChange={(e) => setNewExtPhone(formatPhoneAsYouType(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#1187AA]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Email</label>
                          <input
                            type="email"
                            placeholder="contact@company.com"
                            value={newExtEmail}
                            onChange={(e) => setNewExtEmail(e.target.value.toLowerCase().trim())}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#1187AA]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Modal Footer (Sticky at bottom) */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 text-xs font-bold bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg shadow-xs transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{claimToEdit ? 'Saving Changes...' : 'Saving Claim...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{claimToEdit ? 'Save Changes' : 'Create Claim'}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
