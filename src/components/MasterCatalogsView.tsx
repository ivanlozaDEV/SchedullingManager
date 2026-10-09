import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  Briefcase,
  Building2,
  CalendarCheck,
  Scale,
  User,
  Shield,
  Phone,
  Mail,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import { appSettingsService } from '../lib/appSettingsService';
import type {
  PublicAdjuster,
  CarrierRepresentative,
  ExternalActor,
  Insured,
  Claim,
  CoordinationEvent
} from '../types';

type CatalogCategory =
  | 'pas'
  | 'carrier_reps'
  | 'external_actors'
  | 'carriers'
  | 'event_types'
  | 'insureds';

interface MasterCatalogsViewProps {
  claims: Claim[];
  events: CoordinationEvent[];
  onDataRefresh: () => Promise<unknown>;
}

const PRESET_COLORS = [
  '#0284c7', // Sky Blue
  '#059669', // Emerald
  '#7c3aed', // Purple
  '#d97706', // Amber
  '#e11d48', // Rose
  '#0891b2', // Cyan
  '#4f46e5', // Indigo
  '#475569', // Slate
  '#b91c1c', // Crimson
  '#0d9488', // Teal
];

const EXTERNAL_ACTOR_TYPES = [
  'Appraiser',
  'Umpire',
  'Structural Engineer',
  'General Contractor',
  'Leak Detection Specialist',
  'Roof Consultant',
  'Plumbing Expert',
  'Other Specialist'
];

const CARRIER_REP_TYPES = [
  'Field Adjuster',
  'Desk Adjuster',
  'Independent Adjuster',
  'Staff Adjuster',
  'Engineer / Expert',
  'Supervisor / Team Lead'
];

export function MasterCatalogsView({ claims, events, onDataRefresh }: MasterCatalogsViewProps) {
  // Navigation & Category State
  const [activeCategory, setActiveCategory] = useState<CatalogCategory>('pas');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Entities Data State
  const [pas, setPas] = useState<PublicAdjuster[]>([]);
  const [carrierReps, setCarrierReps] = useState<CarrierRepresentative[]>([]);
  const [externalActors, setExternalActors] = useState<ExternalActor[]>([]);
  const [insureds, setInsureds] = useState<Insured[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  // Modals & Editing State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id?: string; name: string; type: CatalogCategory; count?: number } | null>(null);
  const [updateLinkedRecords, setUpdateLinkedRecords] = useState(true);

  // Form Fields State
  const [formData, setFormData] = useState<Record<string, any>>({});

  // Fetch all catalogs on mount
  const loadCatalogs = async () => {
    setLoading(true);
    try {
      const [fetchedPas, fetchedReps, fetchedActors, fetchedInsureds, fetchedCarriers, fetchedEventTypes] = await Promise.all([
        schedulingService.getPublicAdjusters(true),
        schedulingService.getCarrierReps(),
        schedulingService.getExternalActors(),
        schedulingService.getInsureds(),
        appSettingsService.getCustomCarriers(),
        appSettingsService.getCustomEventTypes(),
      ]);

      setPas(fetchedPas);
      setCarrierReps(fetchedReps);
      setExternalActors(fetchedActors);
      setInsureds(fetchedInsureds);

      // Merge with any distinct values found in claims or events to ensure 100% visibility
      const claimsCarriers = claims.map(c => c.carrier?.trim()).filter(Boolean);
      const allUniqueCarriers = Array.from(new Set([...fetchedCarriers, ...claimsCarriers])).sort((a, b) => a.localeCompare(b));
      setCarriers(allUniqueCarriers);

      const eventsTypes = events.map(e => e.eventType?.trim()).filter(Boolean);
      const allUniqueTypes = Array.from(new Set([...fetchedEventTypes, ...eventsTypes])).sort((a, b) => a.localeCompare(b));
      setEventTypes(allUniqueTypes);
    } catch (err) {
      console.error('Error loading master catalogs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  const triggerFeedback = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  // --------------------------------------------------------------------------
  // COUNTS & USAGE ANALYSIS (To prevent orphans and duplicates)
  // --------------------------------------------------------------------------
  const carrierUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    claims.forEach(c => {
      const norm = (c.carrier || '').trim().toLowerCase();
      if (norm) map[norm] = (map[norm] || 0) + 1;
    });
    return map;
  }, [claims]);

  const eventTypeUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach(e => {
      const norm = (e.eventType || '').trim().toLowerCase();
      if (norm) map[norm] = (map[norm] || 0) + 1;
    });
    return map;
  }, [events]);

  const paUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    claims.forEach(c => {
      if (c.publicAdjusterId) {
        map[c.publicAdjusterId] = (map[c.publicAdjusterId] || 0) + 1;
      }
    });
    return map;
  }, [claims]);

  const insuredUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    claims.forEach(c => {
      if (c.insuredId) {
        map[c.insuredId] = (map[c.insuredId] || 0) + 1;
      }
    });
    return map;
  }, [claims]);

  // --------------------------------------------------------------------------
  // DUPLICATE DETECTORS (Smart similarity & case inspection)
  // --------------------------------------------------------------------------
  const duplicatePas = useMemo(() => {
    const map = new Map<string, number>();
    pas.forEach(p => {
      const key = p.name.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return pas.filter(p => (map.get(p.name.trim().toLowerCase()) || 0) > 1);
  }, [pas]);

  const duplicateReps = useMemo(() => {
    const map = new Map<string, number>();
    carrierReps.forEach(r => {
      const key = `${r.carrierName.trim().toLowerCase()}_${r.name.trim().toLowerCase()}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return carrierReps.filter(r => (map.get(`${r.carrierName.trim().toLowerCase()}_${r.name.trim().toLowerCase()}`) || 0) > 1);
  }, [carrierReps]);

  const duplicateActors = useMemo(() => {
    const map = new Map<string, number>();
    externalActors.forEach(a => {
      const key = `${a.typeOfActor.trim().toLowerCase()}_${a.name.trim().toLowerCase()}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return externalActors.filter(a => (map.get(`${a.typeOfActor.trim().toLowerCase()}_${a.name.trim().toLowerCase()}`) || 0) > 1);
  }, [externalActors]);

  const duplicateCarriers = useMemo(() => {
    const map = new Map<string, number>();
    carriers.forEach(c => {
      const key = c.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return carriers.filter(c => (map.get(c.trim().toLowerCase()) || 0) > 1);
  }, [carriers]);

  const duplicateEventTypes = useMemo(() => {
    const map = new Map<string, number>();
    eventTypes.forEach(t => {
      const key = t.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return eventTypes.filter(t => (map.get(t.trim().toLowerCase()) || 0) > 1);
  }, [eventTypes]);

  const duplicateInsureds = useMemo(() => {
    const map = new Map<string, number>();
    insureds.forEach(i => {
      const key = i.name.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return insureds.filter(i => (map.get(i.name.trim().toLowerCase()) || 0) > 1);
  }, [insureds]);

  // Current category duplicate list
  const currentCategoryDuplicates = useMemo(() => {
    switch (activeCategory) {
      case 'pas': return duplicatePas;
      case 'carrier_reps': return duplicateReps;
      case 'external_actors': return duplicateActors;
      case 'carriers': return duplicateCarriers;
      case 'event_types': return duplicateEventTypes;
      case 'insureds': return duplicateInsureds;
      default: return [];
    }
  }, [activeCategory, duplicatePas, duplicateReps, duplicateActors, duplicateCarriers, duplicateEventTypes, duplicateInsureds]);

  // --------------------------------------------------------------------------
  // FILTERED DATA
  // --------------------------------------------------------------------------
  const q = searchQuery.trim().toLowerCase();

  const filteredPas = useMemo(() => {
    let list = pas;
    if (filterDuplicatesOnly) {
      const dupKeys = new Set(duplicatePas.map(p => p.name.trim().toLowerCase()));
      list = list.filter(p => dupKeys.has(p.name.trim().toLowerCase()));
    }
    if (!q) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.phone && p.phone.toLowerCase().includes(q)) ||
      (p.role && p.role.toLowerCase().includes(q))
    );
  }, [pas, q, filterDuplicatesOnly, duplicatePas]);

  const filteredReps = useMemo(() => {
    let list = carrierReps;
    if (filterDuplicatesOnly) {
      const dupKeys = new Set(duplicateReps.map(r => `${r.carrierName.trim().toLowerCase()}_${r.name.trim().toLowerCase()}`));
      list = list.filter(r => dupKeys.has(`${r.carrierName.trim().toLowerCase()}_${r.name.trim().toLowerCase()}`));
    }
    if (!q) return list;
    return list.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.carrierName.toLowerCase().includes(q) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.typeOfRepresentative && r.typeOfRepresentative.toLowerCase().includes(q))
    );
  }, [carrierReps, q, filterDuplicatesOnly, duplicateReps]);

  const filteredActors = useMemo(() => {
    let list = externalActors;
    if (filterDuplicatesOnly) {
      const dupKeys = new Set(duplicateActors.map(a => `${a.typeOfActor.trim().toLowerCase()}_${a.name.trim().toLowerCase()}`));
      list = list.filter(a => dupKeys.has(`${a.typeOfActor.trim().toLowerCase()}_${a.name.trim().toLowerCase()}`));
    }
    if (!q) return list;
    return list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.typeOfActor.toLowerCase().includes(q) ||
      (a.company && a.company.toLowerCase().includes(q)) ||
      (a.email && a.email.toLowerCase().includes(q)) ||
      (a.phone && a.phone.toLowerCase().includes(q))
    );
  }, [externalActors, q, filterDuplicatesOnly, duplicateActors]);

  const filteredCarriers = useMemo(() => {
    let list = carriers;
    if (filterDuplicatesOnly) {
      const dupKeys = new Set(duplicateCarriers.map(c => c.trim().toLowerCase()));
      list = list.filter(c => dupKeys.has(c.trim().toLowerCase()));
    }
    if (!q) return list;
    return list.filter(c => c.toLowerCase().includes(q));
  }, [carriers, q, filterDuplicatesOnly, duplicateCarriers]);

  const filteredEventTypes = useMemo(() => {
    let list = eventTypes;
    if (filterDuplicatesOnly) {
      const dupKeys = new Set(duplicateEventTypes.map(t => t.trim().toLowerCase()));
      list = list.filter(t => dupKeys.has(t.trim().toLowerCase()));
    }
    if (!q) return list;
    return list.filter(t => t.toLowerCase().includes(q));
  }, [eventTypes, q, filterDuplicatesOnly, duplicateEventTypes]);

  const filteredInsureds = useMemo(() => {
    let list = insureds;
    if (filterDuplicatesOnly) {
      const dupKeys = new Set(duplicateInsureds.map(i => i.name.trim().toLowerCase()));
      list = list.filter(i => dupKeys.has(i.name.trim().toLowerCase()));
    }
    if (!q) return list;
    return list.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.email && i.email.toLowerCase().includes(q)) ||
      (i.phone && i.phone.toLowerCase().includes(q))
    );
  }, [insureds, q, filterDuplicatesOnly, duplicateInsureds]);

  // --------------------------------------------------------------------------
  // LIVE DUPLICATE WARNING IN MODAL FORM
  // --------------------------------------------------------------------------
  const liveDuplicateWarning = useMemo(() => {
    if (!isModalOpen) return null;
    const nameVal = (formData.name || formData.carrierName || formData.typeName || '').trim().toLowerCase();
    if (!nameVal) return null;

    if (activeCategory === 'pas') {
      const exists = pas.find(p => p.id !== editingItem?.id && p.name.trim().toLowerCase() === nameVal);
      if (exists) return `Notice: A Public Adjuster with the name "${exists.name}" already exists.`;
      if (formData.email) {
        const emailExists = pas.find(p => p.id !== editingItem?.id && p.email?.trim().toLowerCase() === formData.email.trim().toLowerCase());
        if (emailExists) return `Notice: A Public Adjuster with the email "${formData.email}" already exists.`;
      }
    } else if (activeCategory === 'carrier_reps') {
      const exists = carrierReps.find(r => r.id !== editingItem?.id && r.name.trim().toLowerCase() === nameVal && r.carrierName.trim().toLowerCase() === (formData.carrierName || '').trim().toLowerCase());
      if (exists) return `Notice: A representative named "${exists.name}" for "${exists.carrierName}" already exists.`;
    } else if (activeCategory === 'external_actors') {
      const exists = externalActors.find(a => a.id !== editingItem?.id && a.name.trim().toLowerCase() === nameVal && a.typeOfActor.trim().toLowerCase() === (formData.typeOfActor || '').trim().toLowerCase());
      if (exists) return `Notice: An external actor named "${exists.name}" as "${exists.typeOfActor}" already exists.`;
    } else if (activeCategory === 'carriers') {
      const exists = carriers.find(c => c.toLowerCase() !== editingItem?.toLowerCase() && c.trim().toLowerCase() === nameVal);
      if (exists) return `Notice: The carrier "${exists}" is already present in the catalog.`;
    } else if (activeCategory === 'event_types') {
      const exists = eventTypes.find(t => t.toLowerCase() !== editingItem?.toLowerCase() && t.trim().toLowerCase() === nameVal);
      if (exists) return `Notice: The event type "${exists}" is already present in the catalog.`;
    } else if (activeCategory === 'insureds') {
      const exists = insureds.find(i => i.id !== editingItem?.id && i.name.trim().toLowerCase() === nameVal);
      if (exists) return `Notice: An insured client with the name "${exists.name}" already exists.`;
    }
    return null;
  }, [isModalOpen, formData, activeCategory, editingItem, pas, carrierReps, externalActors, carriers, eventTypes, insureds]);

  // --------------------------------------------------------------------------
  // OPEN MODAL FOR CREATE / EDIT
  // --------------------------------------------------------------------------
  const openCreateModal = () => {
    setEditingItem(null);
    if (activeCategory === 'pas') {
      setFormData({
        name: '',
        role: 'adjuster',
        email: '',
        phone: '',
        generalAvailability: '',
        colorCode: PRESET_COLORS[0],
        isActive: true,
      });
    } else if (activeCategory === 'carrier_reps') {
      setFormData({
        name: '',
        carrierName: carriers[0] || 'Citizens Property Insurance',
        typeOfRepresentative: 'Field Adjuster',
        phone: '',
        email: '',
        company: '',
        notes: '',
      });
    } else if (activeCategory === 'external_actors') {
      setFormData({
        name: '',
        typeOfActor: 'Appraiser',
        company: '',
        phone: '',
        email: '',
        generalAvailability: '',
        notes: '',
      });
    } else if (activeCategory === 'carriers') {
      setFormData({ carrierName: '' });
    } else if (activeCategory === 'event_types') {
      setFormData({ typeName: '' });
    } else if (activeCategory === 'insureds') {
      setFormData({
        name: '',
        phone: '',
        email: '',
        generalAvailability: '',
        notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    if (activeCategory === 'pas') {
      setFormData({
        name: item.name,
        role: item.role || 'adjuster',
        email: item.email || '',
        phone: item.phone || '',
        generalAvailability: item.generalAvailability || '',
        colorCode: item.colorCode || '#0284c7',
        isActive: item.isActive ?? true,
      });
    } else if (activeCategory === 'carrier_reps') {
      setFormData({
        name: item.name,
        carrierName: item.carrierName,
        typeOfRepresentative: item.typeOfRepresentative || 'Field Adjuster',
        phone: item.phone || '',
        email: item.email || '',
        company: item.company || '',
        notes: item.notes || '',
      });
    } else if (activeCategory === 'external_actors') {
      setFormData({
        name: item.name,
        typeOfActor: item.typeOfActor || 'Appraiser',
        company: item.company || '',
        phone: item.phone || '',
        email: item.email || '',
        generalAvailability: item.generalAvailability || '',
        notes: item.notes || '',
      });
    } else if (activeCategory === 'carriers') {
      setFormData({ carrierName: item });
    } else if (activeCategory === 'event_types') {
      setFormData({ typeName: item });
    } else if (activeCategory === 'insureds') {
      setFormData({
        name: item.name,
        phone: item.phone || '',
        email: item.email || '',
        generalAvailability: item.generalAvailability || '',
        notes: item.notes || '',
      });
    }
    setIsModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // SAVE / CREATE / UPDATE HANDLER
  // --------------------------------------------------------------------------
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (activeCategory === 'pas') {
        if (!formData.name?.trim()) throw new Error('Public Adjuster Name is required');
        if (editingItem) {
          await schedulingService.updatePublicAdjuster(editingItem.id, {
            name: formData.name.trim(),
            role: formData.role,
            email: formData.email?.trim() || undefined,
            phone: formData.phone?.trim() || undefined,
            generalAvailability: formData.generalAvailability?.trim() || undefined,
            colorCode: formData.colorCode,
            isActive: formData.isActive,
          });
          triggerFeedback(`Public Adjuster "${formData.name}" successfully updated.`);
        } else {
          await schedulingService.createPublicAdjuster({
            name: formData.name.trim(),
            role: formData.role,
            email: formData.email?.trim() || undefined,
            phone: formData.phone?.trim() || undefined,
            generalAvailability: formData.generalAvailability?.trim() || undefined,
            colorCode: formData.colorCode,
          });
          triggerFeedback(`New Public Adjuster "${formData.name}" added.`);
        }
      } else if (activeCategory === 'carrier_reps') {
        if (!formData.name?.trim()) throw new Error('Representative Name is required');
        if (!formData.carrierName?.trim()) throw new Error('Carrier is required');
        if (editingItem) {
          await schedulingService.updateCarrierRep(editingItem.id, {
            name: formData.name.trim(),
            carrierName: formData.carrierName.trim(),
            typeOfRepresentative: formData.typeOfRepresentative,
            phone: formData.phone?.trim() || undefined,
            email: formData.email?.trim() || undefined,
            company: formData.company?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
          });
          triggerFeedback(`Carrier Representative "${formData.name}" successfully updated.`);
        } else {
          await schedulingService.createCarrierRep({
            name: formData.name.trim(),
            carrierName: formData.carrierName.trim(),
            typeOfRepresentative: formData.typeOfRepresentative,
            phone: formData.phone?.trim() || undefined,
            email: formData.email?.trim() || undefined,
            company: formData.company?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
          });
          triggerFeedback(`New Carrier Representative "${formData.name}" added.`);
        }
      } else if (activeCategory === 'external_actors') {
        if (!formData.name?.trim()) throw new Error('Actor Name is required');
        if (editingItem) {
          await schedulingService.updateExternalActor(editingItem.id, {
            name: formData.name.trim(),
            typeOfActor: formData.typeOfActor,
            company: formData.company?.trim() || undefined,
            phone: formData.phone?.trim() || undefined,
            email: formData.email?.trim() || undefined,
            generalAvailability: formData.generalAvailability?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
          });
          triggerFeedback(`External Actor "${formData.name}" successfully updated.`);
        } else {
          await schedulingService.createExternalActor({
            name: formData.name.trim(),
            typeOfActor: formData.typeOfActor,
            company: formData.company?.trim() || undefined,
            phone: formData.phone?.trim() || undefined,
            email: formData.email?.trim() || undefined,
            generalAvailability: formData.generalAvailability?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
          });
          triggerFeedback(`New External Actor "${formData.name}" added.`);
        }
      } else if (activeCategory === 'carriers') {
        const cName = formData.carrierName?.trim();
        if (!cName) throw new Error('Carrier Name is required');
        if (editingItem) {
          await appSettingsService.updateCarrier(editingItem, cName, updateLinkedRecords);
          triggerFeedback(`Carrier updated to "${cName}".${updateLinkedRecords ? ' All linked claims and reps updated.' : ''}`);
        } else {
          await appSettingsService.addCustomCarrier(cName);
          triggerFeedback(`Carrier "${cName}" added to catalog.`);
        }
      } else if (activeCategory === 'event_types') {
        const tName = formData.typeName?.trim();
        if (!tName) throw new Error('Event Type Name is required');
        if (editingItem) {
          await appSettingsService.updateEventType(editingItem, tName, updateLinkedRecords);
          triggerFeedback(`Event Type updated to "${tName}".${updateLinkedRecords ? ' All linked events updated.' : ''}`);
        } else {
          await appSettingsService.addCustomEventType(tName);
          triggerFeedback(`Event Type "${tName}" added to catalog.`);
        }
      } else if (activeCategory === 'insureds') {
        if (!formData.name?.trim()) throw new Error('Insured Name is required');
        if (editingItem) {
          await schedulingService.updateInsured(editingItem.id, {
            name: formData.name.trim(),
            phone: formData.phone?.trim() || undefined,
            email: formData.email?.trim() || undefined,
            generalAvailability: formData.generalAvailability?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
          });
          triggerFeedback(`Insured Client "${formData.name}" successfully updated.`);
        } else {
          await schedulingService.createInsured({
            name: formData.name.trim(),
            phone: formData.phone?.trim() || undefined,
            email: formData.email?.trim() || undefined,
            generalAvailability: formData.generalAvailability?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
          });
          triggerFeedback(`New Insured Client "${formData.name}" added.`);
        }
      }

      setIsModalOpen(false);
      await loadCatalogs();
      await onDataRefresh();
    } catch (err: any) {
      alert(`Error saving record: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // DELETE HANDLERS WITH USAGE SAFEGUARDS
  // --------------------------------------------------------------------------
  const promptDelete = (item: any, type: CatalogCategory) => {
    let count = 0;
    let name = '';
    let id: string | undefined = undefined;

    if (type === 'pas') {
      id = item.id;
      name = item.name;
      count = paUsageMap[item.id] || 0;
    } else if (type === 'carrier_reps') {
      id = item.id;
      name = item.name;
    } else if (type === 'external_actors') {
      id = item.id;
      name = item.name;
    } else if (type === 'carriers') {
      name = item;
      count = carrierUsageMap[item.trim().toLowerCase()] || 0;
    } else if (type === 'event_types') {
      name = item;
      count = eventTypeUsageMap[item.trim().toLowerCase()] || 0;
    } else if (type === 'insureds') {
      id = item.id;
      name = item.name;
      count = insuredUsageMap[item.id] || 0;
    }

    setItemToDelete({ id, name, type, count });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setLoading(true);

    try {
      if (itemToDelete.type === 'pas' && itemToDelete.id) {
        await schedulingService.deletePublicAdjuster(itemToDelete.id);
        triggerFeedback(`Public Adjuster "${itemToDelete.name}" removed.`);
      } else if (itemToDelete.type === 'carrier_reps' && itemToDelete.id) {
        await schedulingService.deleteCarrierRep(itemToDelete.id);
        triggerFeedback(`Carrier Representative "${itemToDelete.name}" removed.`);
      } else if (itemToDelete.type === 'external_actors' && itemToDelete.id) {
        await schedulingService.deleteExternalActor(itemToDelete.id);
        triggerFeedback(`External Actor "${itemToDelete.name}" removed.`);
      } else if (itemToDelete.type === 'carriers') {
        await appSettingsService.deleteCarrier(itemToDelete.name);
        triggerFeedback(`Carrier "${itemToDelete.name}" removed from catalog.`);
      } else if (itemToDelete.type === 'event_types') {
        await appSettingsService.deleteEventType(itemToDelete.name);
        triggerFeedback(`Event Type "${itemToDelete.name}" removed from catalog.`);
      } else if (itemToDelete.type === 'insureds' && itemToDelete.id) {
        await schedulingService.deleteInsured(itemToDelete.id);
        triggerFeedback(`Insured Client "${itemToDelete.name}" removed.`);
      }

      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      await loadCatalogs();
      await onDataRefresh();
    } catch (err: any) {
      alert(`Error deleting record: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Quick PA active toggle
  const togglePaActive = async (pa: PublicAdjuster) => {
    try {
      await schedulingService.updatePublicAdjuster(pa.id, {
        name: pa.name,
        isActive: !pa.isActive,
      });
      triggerFeedback(`PA "${pa.name}" set to ${!pa.isActive ? 'Active' : 'Inactive'}.`);
      await loadCatalogs();
      await onDataRefresh();
    } catch (err: any) {
      alert(`Error toggling status: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* TOP HEADER & STATS OVERVIEW */}
      {/* ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-tealBrand-50 border border-tealBrand-200 text-tealBrand-700 rounded-xl">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black font-['Montserrat',sans-serif] text-slate-900 tracking-tight">
                  Directory & Master Catalogs
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Centralized CRUD management of all internal adjusters, carrier reps, specialists, carriers, and event types without duplication.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={loadCatalogs}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
              title="Refresh catalogs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-maroon-800 to-maroon-900 hover:from-maroon-900 hover:to-black text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>
                {activeCategory === 'pas' && 'Add Public Adjuster'}
                {activeCategory === 'carrier_reps' && 'Add Carrier Rep'}
                {activeCategory === 'external_actors' && 'Add External Specialist'}
                {activeCategory === 'carriers' && 'Add Carrier'}
                {activeCategory === 'event_types' && 'Add Event Type'}
                {activeCategory === 'insureds' && 'Add Insured Client'}
              </span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {actionSuccessMsg && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {/* Categories Bar / Navigation Pills */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => { setActiveCategory('pas'); setFilterDuplicatesOnly(false); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeCategory === 'pas'
                ? 'bg-tealBrand-50/80 border-tealBrand-400 text-tealBrand-900 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <Briefcase className="w-4 h-4 text-tealBrand-600" />
              <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200">
                {pas.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold font-['Montserrat',sans-serif]">Public Adjusters</div>
            <div className="text-[10px] text-slate-500">{pas.filter(p => p.isActive).length} active PAs</div>
          </button>

          <button
            type="button"
            onClick={() => { setActiveCategory('carrier_reps'); setFilterDuplicatesOnly(false); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeCategory === 'carrier_reps'
                ? 'bg-tealBrand-50/80 border-tealBrand-400 text-tealBrand-900 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <Shield className="w-4 h-4 text-cyan-600" />
              <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200">
                {carrierReps.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold font-['Montserrat',sans-serif]">Carrier Reps</div>
            <div className="text-[10px] text-slate-500">Field & Desk Adjusters</div>
          </button>

          <button
            type="button"
            onClick={() => { setActiveCategory('external_actors'); setFilterDuplicatesOnly(false); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeCategory === 'external_actors'
                ? 'bg-tealBrand-50/80 border-tealBrand-400 text-tealBrand-900 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <Scale className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200">
                {externalActors.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold font-['Montserrat',sans-serif]">Appraisers & Umpires</div>
            <div className="text-[10px] text-slate-500">External Specialists</div>
          </button>

          <button
            type="button"
            onClick={() => { setActiveCategory('carriers'); setFilterDuplicatesOnly(false); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeCategory === 'carriers'
                ? 'bg-tealBrand-50/80 border-tealBrand-400 text-tealBrand-900 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <Building2 className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200">
                {carriers.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold font-['Montserrat',sans-serif]">Insurance Carriers</div>
            <div className="text-[10px] text-slate-500">{claims.length} claims registered</div>
          </button>

          <button
            type="button"
            onClick={() => { setActiveCategory('event_types'); setFilterDuplicatesOnly(false); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeCategory === 'event_types'
                ? 'bg-tealBrand-50/80 border-tealBrand-400 text-tealBrand-900 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <CalendarCheck className="w-4 h-4 text-rose-600" />
              <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200">
                {eventTypes.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold font-['Montserrat',sans-serif]">Event Types</div>
            <div className="text-[10px] text-slate-500">{events.length} events scheduled</div>
          </button>

          <button
            type="button"
            onClick={() => { setActiveCategory('insureds'); setFilterDuplicatesOnly(false); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeCategory === 'insureds'
                ? 'bg-tealBrand-50/80 border-tealBrand-400 text-tealBrand-900 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <User className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-white border border-slate-200">
                {insureds.length}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold font-['Montserrat',sans-serif]">Insured Clients</div>
            <div className="text-[10px] text-slate-500">Policyholders Directory</div>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TOOLBAR: SEARCH & DUPLICATE CLEANUP SCANNER */}
      {/* ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Search ${activeCategory.replace('_', ' ')} by name, email, phone...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-maroon-800 focus:bg-white transition-colors"
          />
        </div>

        {/* Duplicate Cleaner / Quality Assurance Pill */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {currentCategoryDuplicates.length > 0 ? (
            <button
              type="button"
              onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                filterDuplicatesOnly
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>
                {currentCategoryDuplicates.length} Duplicate(s) Found
              </span>
              <span className="text-[10px] underline ml-1">
                {filterDuplicatesOnly ? 'Show All' : 'Inspect'}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Clean Catalog: No Duplicates Detected</span>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* CATEGORY 1: PUBLIC ADJUSTERS (PAs) */}
      {/* ==================================================================== */}
      {activeCategory === 'pas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPas.map((pa) => {
            const usageCount = paUsageMap[pa.id] || 0;
            return (
              <div
                key={pa.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: pa.colorCode || '#0284c7' }}
                      />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif]">
                          {pa.name}
                        </h4>
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-tealBrand-700 bg-tealBrand-50 px-2 py-0.5 rounded-full border border-tealBrand-200/60 mt-0.5">
                          {pa.role === 'adjuster' ? 'Public Adjuster' : pa.role === 'senior_adjuster' ? 'Senior Adjuster' : pa.role === 'director' ? 'Managing Director' : pa.role}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePaActive(pa)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all ${
                        pa.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                      }`}
                      title="Click to toggle status"
                    >
                      {pa.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
                    {pa.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{pa.email}</span>
                      </div>
                    )}
                    {pa.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{pa.phone}</span>
                      </div>
                    )}
                    {pa.generalAvailability && (
                      <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-slate-700">
                        <span className="font-semibold text-slate-800">Availability / Zone:</span> {pa.generalAvailability}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Assigned to <strong>{usageCount}</strong> claim{usageCount === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(pa)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Edit PA"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => promptDelete(pa, 'pas')}
                      className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                      title="Delete PA"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* CATEGORY 2: CARRIER REPRESENTATIVES */}
      {/* ==================================================================== */}
      {activeCategory === 'carrier_reps' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReps.map((rep) => (
            <div
              key={rep.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-200 inline-block">
                      {rep.carrierName}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif] mt-1">
                      {rep.name}
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {rep.typeOfRepresentative} {rep.company ? `(${rep.company})` : ''}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
                  {rep.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{rep.email}</span>
                    </div>
                  )}
                  {rep.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{rep.phone}</span>
                    </div>
                  )}
                  {rep.notes && (
                    <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-slate-600">
                      {rep.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditModal(rep)}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  title="Edit Representative"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => promptDelete(rep, 'carrier_reps')}
                  className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                  title="Delete Representative"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================================================================== */}
      {/* CATEGORY 3: EXTERNAL ACTORS (APPRAISERS & UMPIRES) */}
      {/* ==================================================================== */}
      {activeCategory === 'external_actors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredActors.map((actor) => (
            <div
              key={actor.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 inline-block">
                      {actor.typeOfActor}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif] mt-1">
                      {actor.name}
                    </h4>
                    {actor.company && (
                      <span className="text-xs text-slate-500 font-medium">{actor.company}</span>
                    )}
                  </div>
                </div>

                <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
                  {actor.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{actor.email}</span>
                    </div>
                  )}
                  {actor.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{actor.phone}</span>
                    </div>
                  )}
                  {actor.generalAvailability && (
                    <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-slate-700">
                      <span className="font-semibold text-slate-800">Coverage:</span> {actor.generalAvailability}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditModal(actor)}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  title="Edit Actor"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => promptDelete(actor, 'external_actors')}
                  className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                  title="Delete Actor"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================================================================== */}
      {/* CATEGORY 4: INSURANCE CARRIERS */}
      {/* ==================================================================== */}
      {activeCategory === 'carriers' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="divide-y divide-slate-100">
            {filteredCarriers.map((carrierName, idx) => {
              const count = carrierUsageMap[carrierName.trim().toLowerCase()] || 0;
              const hasDup = (duplicateCarriers.filter(c => c.trim().toLowerCase() === carrierName.trim().toLowerCase()).length) > 1;

              return (
                <div
                  key={`${carrierName}-${idx}`}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 font-bold text-xs">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif]">
                          {carrierName}
                        </span>
                        {hasDup && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                            Duplicate Case
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Used in <strong>{count}</strong> registered claim{count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(carrierName)}
                      className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Rename Carrier"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => promptDelete(carrierName, 'carriers')}
                      className="p-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                      title="Delete Carrier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CATEGORY 5: EVENT TYPES */}
      {/* ==================================================================== */}
      {activeCategory === 'event_types' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="divide-y divide-slate-100">
            {filteredEventTypes.map((typeName, idx) => {
              const count = eventTypeUsageMap[typeName.trim().toLowerCase()] || 0;
              const hasDup = (duplicateEventTypes.filter(t => t.trim().toLowerCase() === typeName.trim().toLowerCase()).length) > 1;

              return (
                <div
                  key={`${typeName}-${idx}`}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0 font-bold text-xs">
                      <CalendarCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif]">
                          {typeName}
                        </span>
                        {hasDup && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                            Duplicate Case
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Used in <strong>{count}</strong> active/completed event{count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(typeName)}
                      className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Rename Event Type"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => promptDelete(typeName, 'event_types')}
                      className="p-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                      title="Delete Event Type"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CATEGORY 6: INSURED CLIENTS */}
      {/* ==================================================================== */}
      {activeCategory === 'insureds' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInsureds.map((insured) => {
            const count = insuredUsageMap[insured.id] || 0;
            return (
              <div
                key={insured.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 font-['Montserrat',sans-serif]">
                        {insured.name}
                      </h4>
                      <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold inline-block mt-0.5">
                        Policyholder
                      </span>
                    </div>
                  </div>

                  <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
                    {insured.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{insured.email}</span>
                      </div>
                    )}
                    {insured.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{insured.phone}</span>
                      </div>
                    )}
                    {insured.generalAvailability && (
                      <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-slate-700">
                        <span className="font-semibold text-slate-800">Preferred Hours:</span> {insured.generalAvailability}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Associated to <strong>{count}</strong> claim{count === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(insured)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Edit Insured"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => promptDelete(insured, 'insureds')}
                      className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                      title="Delete Insured"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE / EDIT RECORD */}
      {/* ==================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white rounded-xl border border-slate-200 text-maroon-800">
                  {editingItem ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-['Montserrat',sans-serif]">
                    {editingItem ? 'Edit Entry' : 'Create New Entry'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Catalog: {activeCategory.replace('_', ' ').toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Live Duplicate Warning */}
              {liveDuplicateWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{liveDuplicateWarning}</span>
                </div>
              )}

              {/* 1. PUBLIC ADJUSTERS FORM */}
              {activeCategory === 'pas' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe, PA"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Role
                      </label>
                      <select
                        value={formData.role || 'adjuster'}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      >
                        <option value="adjuster">Public Adjuster</option>
                        <option value="senior_adjuster">Senior Public Adjuster</option>
                        <option value="director">Managing Director</option>
                        <option value="apprentice">Apprentice / Assistant</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Badge Color
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormData({ ...formData, colorCode: c })}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              formData.colorCode === c ? 'scale-125 border-slate-900' : 'border-white hover:scale-110'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="pa@ipadjustinggroup.com"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Direct Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="(772) 000-0000"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Coverage & General Availability
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Miami-Dade & Broward, Mon-Fri mornings"
                      value={formData.generalAvailability || ''}
                      onChange={(e) => setFormData({ ...formData, generalAvailability: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  {editingItem && (
                    <div className="pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isActive ?? true}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="w-4 h-4 text-tealBrand-600 rounded border-slate-300 focus:ring-tealBrand-500"
                        />
                        <span className="text-xs font-bold text-slate-700">Active Public Adjuster</span>
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* 2. CARRIER REPRESENTATIVE FORM */}
              {activeCategory === 'carrier_reps' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Insurance Carrier *
                    </label>
                    <select
                      value={formData.carrierName || ''}
                      onChange={(e) => setFormData({ ...formData, carrierName: e.target.value })}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    >
                      {carriers.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Representative Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Robert Smith"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Type of Rep
                      </label>
                      <select
                        value={formData.typeOfRepresentative || 'Field Adjuster'}
                        onChange={(e) => setFormData({ ...formData, typeOfRepresentative: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      >
                        {CARRIER_REP_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Independent Firm (If applicable)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sedgwick, Crawford"
                        value={formData.company || ''}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="(000) 000-0000"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="adjuster@carrier.com"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Special instructions or contact preferences..."
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                </>
              )}

              {/* 3. EXTERNAL ACTORS FORM */}
              {activeCategory === 'external_actors' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Specialist Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. David Williams"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Category / Role
                      </label>
                      <select
                        value={formData.typeOfActor || 'Appraiser'}
                        onChange={(e) => setFormData({ ...formData, typeOfActor: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      >
                        {EXTERNAL_ACTOR_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Company / Firm Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Precision Appraisal Services"
                        value={formData.company || ''}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="(000) 000-0000"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="expert@company.com"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Coverage & Service Territory
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Palm Beach, St. Lucie, Martin County"
                      value={formData.generalAvailability || ''}
                      onChange={(e) => setFormData({ ...formData, generalAvailability: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                </>
              )}

              {/* 4. CARRIERS FORM */}
              {activeCategory === 'carriers' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Carrier Official Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Citizens Property Insurance"
                      value={formData.carrierName || ''}
                      onChange={(e) => setFormData({ ...formData, carrierName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  {editingItem && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={updateLinkedRecords}
                          onChange={(e) => setUpdateLinkedRecords(e.target.checked)}
                          className="w-4 h-4 text-maroon-800 rounded border-slate-300 mt-0.5"
                        />
                        <div className="text-xs text-slate-700">
                          <strong className="text-slate-900">Synchronize all linked claims and representatives</strong>
                          <p className="text-slate-500 mt-0.5">
                            Automatically updates existing claims registered with "{editingItem}" to "{formData.carrierName || editingItem}".
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* 5. EVENT TYPES FORM */}
              {activeCategory === 'event_types' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Event Type Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Appraisal Meeting, Re-Inspection..."
                      value={formData.typeName || ''}
                      onChange={(e) => setFormData({ ...formData, typeName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  {editingItem && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={updateLinkedRecords}
                          onChange={(e) => setUpdateLinkedRecords(e.target.checked)}
                          className="w-4 h-4 text-maroon-800 rounded border-slate-300 mt-0.5"
                        />
                        <div className="text-xs text-slate-700">
                          <strong className="text-slate-900">Synchronize all scheduled events</strong>
                          <p className="text-slate-500 mt-0.5">
                            Automatically updates existing events registered with "{editingItem}" to "{formData.typeName || editingItem}".
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* 6. INSUREDS FORM */}
              {activeCategory === 'insureds' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Insured Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maria Gonzalez"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        placeholder="(000) 000-0000"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="client@gmail.com"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Schedule Availability
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Saturdays only or weekdays after 3:00 PM"
                      value={formData.generalAvailability || ''}
                      onChange={(e) => setFormData({ ...formData, generalAvailability: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-maroon-800"
                    />
                  </div>
                </>
              )}

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-bold text-white bg-maroon-800 hover:bg-maroon-900 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {loading ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: DELETE CONFIRMATION & SAFETY WARNING */}
      {/* ==================================================================== */}
      {isDeleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 font-['Montserrat',sans-serif]">
                  Confirm Deletion
                </h3>
                <p className="text-xs text-slate-500">
                  Item: <strong className="text-slate-800">{itemToDelete.name}</strong>
                </p>
              </div>
            </div>

            {itemToDelete.count && itemToDelete.count > 0 ? (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Active references detected
                </div>
                <p>
                  This entry is currently associated with <strong>{itemToDelete.count}</strong> registered record(s) in the system.
                  Deleting it will keep historical data intact, but it will no longer be available in pickers.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete this record from the catalog? This action cannot be undone.
              </p>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setIsDeleteModalOpen(false); setItemToDelete(null); }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Keep Record
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
