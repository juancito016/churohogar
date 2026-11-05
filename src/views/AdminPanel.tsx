import React, { useState, useEffect, useId } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from '../services/supabaseClient';
import { useLocationManager } from '../hooks/useLocationManager';
import { useIdleLogout, clearStoredActivity } from '../hooks/useIdleLogout';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { FaSignOutAlt, FaHome, FaMapMarkerAlt, FaCogs, FaSpinner, FaSearch, FaGlobe, FaLock, FaUsers, FaUserShield, FaBars, FaTimes } from 'react-icons/fa';
import logoUrl from '../components/imagenes/logo.webp';

// Import new components
import { AdminLogin } from '../components/admin/AdminLogin';
import { AdminPropertiesTab } from '../components/admin/AdminPropertiesTab';
import { AdminLocationsTab } from '../components/admin/AdminLocationsTab';
import { AdminEmbeddingsTab } from '../components/admin/AdminEmbeddingsTab';
import { AdminSystemTab } from '../components/admin/AdminSystemTab';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminRolesTab } from '../components/admin/AdminRolesTab';
import { ChangePasswordModal } from '../components/admin/ChangePasswordModal';
import { AccessibleModal } from '../components/ui/AccessibleModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const ADMIN_ACCESS_KEY = 'churo:admin-access';
const ADMIN_ACCESS_TTL = 10 * 60 * 1000;

type AdminAccessCache = {
    userId: string;
    checkedAt: number;
};

let cachedSession: Session | null | undefined;
let cachedAdminAccess: AdminAccessCache | null | undefined;

const readAdminAccess = (): AdminAccessCache | null => {
    if (cachedAdminAccess !== undefined) return cachedAdminAccess;

    try {
        const raw = sessionStorage.getItem(ADMIN_ACCESS_KEY);
        if (!raw) {
            cachedAdminAccess = null;
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<AdminAccessCache>;
        if (typeof parsed.userId !== 'string' || typeof parsed.checkedAt !== 'number') {
            cachedAdminAccess = null;
            return null;
        }

        cachedAdminAccess = { userId: parsed.userId, checkedAt: parsed.checkedAt };
        return cachedAdminAccess;
    } catch {
        cachedAdminAccess = null;
        return null;
    }
};

const writeAdminAccess = (userId: string) => {
    const value = { userId, checkedAt: Date.now() };
    cachedAdminAccess = value;

    try {
        sessionStorage.setItem(ADMIN_ACCESS_KEY, JSON.stringify(value));
    } catch {
        return;
    }
};

const clearAdminAccess = () => {
    cachedAdminAccess = null;

    try {
        sessionStorage.removeItem(ADMIN_ACCESS_KEY);
    } catch {
        return;
    }
};

const isAdminAccessFresh = (cache: AdminAccessCache) =>
    Date.now() - cache.checkedAt < ADMIN_ACCESS_TTL;

const AdminBootScreen: React.FC = () => (
    <div className="admin-shell min-h-screen bg-admin-bg text-admin-text flex items-center justify-center p-4">
        <div role="status" aria-label="Cargando panel">
            <div className="w-10 h-10 border-4 border-admin-accent/30 border-t-admin-accent rounded-full animate-spin" />
        </div>
    </div>
);

export const AdminPanel: React.FC = () => {
    const initialUserId = cachedSession?.user?.id;
    const initialAdminAccess = initialUserId ? readAdminAccess() : null;

    const [session, setSession] = useState<Session | null>(() => cachedSession ?? null);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(() =>
        initialUserId && initialAdminAccess?.userId === initialUserId ? true : null
    );
    const [authReady, setAuthReady] = useState(() => cachedSession !== undefined);
    const [accessMessage, setAccessMessage] = useState<string | null>(null);
    const [accessTone, setAccessTone] = useState<'error' | 'info'>('error');
    const [activeTab, setActiveTab] = useState<'inmuebles' | 'ubicaciones' | 'busqueda' | 'usuarios' | 'roles' | 'sistema'>('inmuebles');
    const [consultaSemantica, setConsultaSemantica] = useState('');
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showLogoutEverywhere, setShowLogoutEverywhere] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const idleTitleId = useId();
    const idleDescriptionId = useId();
    const stayActiveRef = React.useRef<HTMLButtonElement>(null);

    const {
        departamentos, ciudades,
        fetchDepartamentos, fetchCiudades,
        addDepartamento, renameDepartamento, deleteDepartamento,
        addCiudad, renameCiudad, deleteCiudad,
        fetchBarrios, addBarrio, renameBarrio, deleteBarrio, mergeBarrios
    } = useLocationManager();

    const { permisos, loading: permisosLoading, error: permisosError } = useAdminPermissions(
        Boolean(session?.user?.id) && isAdmin === true
    );

    // Si la RPC de permisos falla, se mantiene el panel anterior en vez de
    // dejar la pantalla vacía; la base sigue siendo la que autoriza.
    const legacy = Boolean(permisosError);
    const puede = (clave: string) => legacy || permisos.includes(clave);

    const puedeVerInmuebles = legacy
        || puede('inmuebles.ver.todos')
        || puede('inmuebles.editar.propios')
        || puede('inmuebles.crear')
        || puede('imagenes.gestionar');
    const puedeVerUbicaciones = legacy || puede('ubicaciones.gestionar');
    const puedeVerBusqueda = legacy
        || puede('embeddings.ver')
        || puede('embeddings.reindexar');
    const puedeVerUsuarios = !legacy && puede('usuarios.ver');
    const puedeVerRoles = !legacy && puede('roles.ver');
    const puedeVerSistema = legacy
        || puede('configuracion.ver')
        || puede('estadisticas.ver')
        || puede('cache.ver')
        || puede('cache.purgar');

    useEffect(() => {
        if (isAdmin !== true || permisosLoading) return;

        const disponible = {
            inmuebles: puedeVerInmuebles,
            ubicaciones: puedeVerUbicaciones,
            busqueda: puedeVerBusqueda,
            usuarios: puedeVerUsuarios,
            roles: puedeVerRoles,
            sistema: puedeVerSistema,
        } as const;

        if (!disponible[activeTab]) {
            const primera = (Object.keys(disponible) as Array<keyof typeof disponible>)
                .find(clave => disponible[clave]);

            if (primera) setActiveTab(primera);
        }
    }, [
        activeTab,
        isAdmin,
        permisosLoading,
        puedeVerInmuebles,
        puedeVerUbicaciones,
        puedeVerBusqueda,
        puedeVerUsuarios,
        puedeVerRoles,
        puedeVerSistema,
    ]);

    useEffect(() => {
        if (!mobileNavOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileNavOpen(false);
        };

        const previousOverflow = document.body.style.overflow;
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [mobileNavOpen]);

    useEffect(() => {
        let active = true;

        const applySession = (nextSession: Session | null) => {
            cachedSession = nextSession;
            setSession(nextSession);
        };

        const initSession = async () => {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (!active) return;

                if (error) {
                    await supabase.auth.signOut();
                    if (!active) return;
                    cachedSession = null;
                    setSession(null);
                    return;
                }

                applySession(data.session);

                const userId = data.session?.user?.id;
                const cachedAccess = userId ? readAdminAccess() : null;
                if (userId && cachedAccess?.userId === userId) {
                    setIsAdmin(true);
                    setAccessMessage(null);
                }
            } catch {
                if (!active) return;
                cachedSession = null;
                setSession(null);
            } finally {
                if (active) setAuthReady(true);
            }
        };

        initSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (event === 'SIGNED_OUT') {
                cachedSession = null;
                clearAdminAccess();
                setSession(null);
                setIsAdmin(null);
                setAuthReady(true);
                return;
            }

            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                cachedSession = newSession;
                setSession(newSession);
                setAccessMessage(null);

                const userId = newSession?.user?.id;
                const cachedAccess = userId ? readAdminAccess() : null;
                setIsAdmin(userId && cachedAccess?.userId === userId ? true : null);
                setAuthReady(true);
                return;
            }

            if (event === 'TOKEN_REFRESHED') {
                cachedSession = newSession;
                setSession(newSession);
                setAuthReady(true);
            }
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const userId = session?.user?.id;

        if (!userId) {
            setIsAdmin(null);
            return;
        }

        const cachedAccess = readAdminAccess();
        const cacheMatches = cachedAccess?.userId === userId;

        if (cachedAccess && cachedAccess.userId === userId) {
            setIsAdmin(true);
            setAccessMessage(null);
            if (isAdminAccessFresh(cachedAccess)) return;
        } else {
            setIsAdmin(null);
        }

        const checkAdmin = async () => {
            const { data, error } = await supabase.rpc('is_admin');
            if (cancelled) return;

            if (error) {
                setAccessMessage('No se pudo verificar el acceso. Intenta de nuevo.');
                if (!cacheMatches) {
                    setIsAdmin(false);
                    await supabase.auth.signOut();
                }
                return;
            }

            if (data !== true) {
                clearAdminAccess();
                setAccessMessage('Sin acceso: esta cuenta no es administradora.');
                setIsAdmin(false);
                await supabase.auth.signOut();
                return;
            }

            writeAdminAccess(userId);
            setIsAdmin(true);
            setAccessMessage(null);
        };

        checkAdmin();

        return () => {
            cancelled = true;
        };
    }, [session?.user?.id]);

    useEffect(() => {
        if (session?.user?.id && isAdmin === true) {
            fetchDepartamentos();
            fetchCiudades();
        }
    }, [session?.user?.id, isAdmin, fetchDepartamentos, fetchCiudades]);

    type LogoutOptions = {
        /** `global` cierra la sesión también en los demás navegadores. */
        scope?: 'local' | 'global';
        toastMessage?: string;
        /** Mensaje que verá el administrador en la pantalla de acceso. */
        message?: string | null;
    };

    const performLogout = async ({
        scope = 'local',
        toastMessage = 'Sesión cerrada',
        message = null,
    }: LogoutOptions = {}) => {
        if (isLoggingOut) return;

        setIsLoggingOut(true);
        const toastId = toast.loading(
            scope === 'global' ? 'Cerrando sesión en todos los dispositivos...' : 'Cerrando sesión...'
        );
        let serverError = false;

        try {
            // `signOut()` sin opciones usa `scope: 'global'`: hay que ser explícito
            // para que “Salir” cierre solo este navegador.
            const { error } = await supabase.auth.signOut({ scope });
            if (error) serverError = true;
        } catch (error) {
            serverError = true;
            console.warn('No se pudo cerrar la sesión en Supabase.', error);
        } finally {
            cachedSession = null;
            clearAdminAccess();
            clearStoredActivity();
            setSession(null);
            setIsAdmin(null);
            setAccessMessage(message);
            setAccessTone(message ? 'info' : 'error');
            setIsLoggingOut(false);
            setShowLogoutEverywhere(false);

            if (serverError) {
                toast.error('Se cerró la sesión en este dispositivo. Revisa tu conexión.', { id: toastId });
            } else {
                toast.success(toastMessage, { id: toastId });
            }
        }
    };

    const handleLogout = () => performLogout();

    const navItems = [
        { id: 'inmuebles' as const, label: 'Inmuebles', icon: FaHome, visible: puedeVerInmuebles },
        { id: 'ubicaciones' as const, label: 'Ubicaciones', icon: FaMapMarkerAlt, visible: puedeVerUbicaciones },
        { id: 'busqueda' as const, label: 'Búsqueda', icon: FaSearch, visible: puedeVerBusqueda },
        { id: 'usuarios' as const, label: 'Usuarios', icon: FaUsers, visible: puedeVerUsuarios },
        { id: 'roles' as const, label: 'Roles', icon: FaUserShield, visible: puedeVerRoles },
        { id: 'sistema' as const, label: 'Sistema', icon: FaCogs, visible: puedeVerSistema },
    ].filter(item => item.visible);

    const activeLabel = navItems.find(item => item.id === activeTab)?.label ?? 'Panel';

    const renderNav = (mobile = false) => navItems.map(item => {
        const Icono = item.icon;
        const activo = activeTab === item.id;

        return (
            <button
                key={item.id}
                role="tab"
                aria-selected={activo}
                onClick={() => {
                    setActiveTab(item.id);
                    if (mobile) setMobileNavOpen(false);
                }}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    activo
                        ? 'bg-admin-surface-2 text-admin-text ring-1 ring-admin-border'
                        : 'text-admin-muted hover:bg-admin-surface-2/70 hover:text-admin-text'
                }`}
            >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                    activo ? 'bg-admin-accent-soft text-admin-accent' : 'bg-admin-surface-2 text-admin-muted group-hover:text-admin-text'
                }`}>
                    <Icono aria-hidden />
                </span>
                <span className="truncate">{item.label}</span>
                {activo && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-admin-accent" aria-hidden />}
            </button>
        );
    });

    const renderSessionActions = () => (
        <>
            <button
                type="button"
                onClick={() => {
                    setShowChangePassword(true);
                    setMobileNavOpen(false);
                }}
                disabled={isLoggingOut}
                aria-label="Cambiar contraseña"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-admin-muted transition hover:bg-admin-surface-2 hover:text-admin-text disabled:opacity-50"
            >
                <FaLock aria-hidden /> Contraseña
            </button>
            <button
                type="button"
                onClick={() => {
                    setShowLogoutEverywhere(true);
                    setMobileNavOpen(false);
                }}
                disabled={isLoggingOut}
                aria-label="Cerrar sesión en todos los dispositivos"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-admin-muted transition hover:bg-admin-surface-2 hover:text-admin-text disabled:opacity-50"
            >
                <FaGlobe aria-hidden /> Todos los dispositivos
            </button>
            <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-busy={isLoggingOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-admin-danger transition hover:bg-admin-danger-soft disabled:opacity-50"
            >
                {isLoggingOut ? <FaSpinner className="animate-spin" aria-hidden /> : <FaSignOutAlt aria-hidden />}
                {isLoggingOut ? 'Saliendo…' : 'Salir'}
            </button>
        </>
    );

    const { warningSeconds, stayActive } = useIdleLogout({
        enabled: Boolean(session?.user?.id) && isAdmin === true,
        onExpire: () =>
            performLogout({
                toastMessage: 'Sesión cerrada por inactividad',
                message: 'Tu sesión se cerró por inactividad. Vuelve a iniciar sesión para continuar.',
            }),
    });

    if (!authReady) {
        return <AdminBootScreen />;
    }

    if (!session) {
        return <AdminLogin message={accessMessage} messageTone={accessTone} />;
    }

    if (isAdmin === null) {
        return <AdminBootScreen />;
    }

    if (isAdmin === true && permisosLoading) {
        return <AdminBootScreen />;
    }

    if (isAdmin === false) {
        return (
            <div className="admin-shell min-h-screen bg-admin-bg text-admin-text flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-admin-surface rounded-2xl shadow-xl p-8 text-center border border-admin-border">
                    <h2 className="text-2xl font-black text-admin-text mb-2">Sin acceso</h2>
                    <p className="text-admin-muted mb-6">{accessMessage ?? 'Esta cuenta no es administradora.'}</p>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        aria-busy={isLoggingOut}
                        className="w-full py-3 px-4 text-white bg-admin-primary hover:bg-opacity-90 rounded-xl font-bold disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoggingOut ? <FaSpinner className="animate-spin" /> : <FaSignOutAlt />}
                        {isLoggingOut ? 'Saliendo...' : 'Cerrar sesión'}
                    </button>
                </div>
            </div>
        );
    }

    const sinPermisos = !puedeVerInmuebles
        && !puedeVerUbicaciones
        && !puedeVerBusqueda
        && !puedeVerUsuarios
        && !puedeVerRoles
        && !puedeVerSistema;

    if (sinPermisos) {
        return (
            <div className="admin-shell min-h-screen bg-admin-bg text-admin-text flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-admin-surface rounded-2xl shadow-xl p-8 text-center border border-admin-border">
                    <h2 className="text-2xl font-black text-admin-text mb-2">Sin permisos asignados</h2>
                    <p className="text-admin-muted mb-6">
                        Tu cuenta puede entrar al panel, pero ningún rol le da acceso a una sección.
                        Pide a un Superadmin que te asigne un rol.
                    </p>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        aria-busy={isLoggingOut}
                        className="w-full py-3 px-4 text-white bg-admin-primary hover:bg-opacity-90 rounded-xl font-bold disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoggingOut ? <FaSpinner className="animate-spin" /> : <FaSignOutAlt />}
                        {isLoggingOut ? 'Saliendo...' : 'Cerrar sesión'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-shell min-h-screen bg-admin-bg text-admin-text font-sans">
            <Toaster
                position="top-right"
                toastOptions={{
                    style: {
                        background: '#1E1916',
                        color: '#F5EFE6',
                        border: '1px solid #3A302A',
                    },
                }}
            />

            {warningSeconds !== null && (
                <AccessibleModal
                    onClose={stayActive}
                    labelledBy={idleTitleId}
                    describedBy={idleDescriptionId}
                    initialFocusRef={stayActiveRef}
                    className="w-full max-w-md rounded-3xl bg-admin-surface p-6 shadow-2xl"
                    overlayClassName="z-[90]"
                >
                    <h3 id={idleTitleId} className="text-xl font-black text-admin-text">
                        ¿Sigues ahí?
                    </h3>
                    <p id={idleDescriptionId} aria-live="polite" className="mt-2 text-sm text-admin-muted">
                        Por seguridad, tu sesión se cerrará en{' '}
                        <strong>{warningSeconds} segundo{warningSeconds === 1 ? '' : 's'}</strong> por inactividad.
                    </p>
                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={() => performLogout({ toastMessage: 'Sesión cerrada' })}
                            className="rounded-xl px-5 py-3 font-bold text-admin-muted transition hover:bg-admin-surface-2"
                        >
                            Cerrar sesión
                        </button>
                        <button
                            ref={stayActiveRef}
                            type="button"
                            onClick={stayActive}
                            className="rounded-xl bg-admin-primary px-5 py-3 font-bold text-white transition hover:bg-admin-primary-hover"
                        >
                            Seguir conectado
                        </button>
                    </div>
                </AccessibleModal>
            )}

            <ConfirmDialog
                open={showLogoutEverywhere}
                title="Cerrar sesión en todos los dispositivos"
                description="Se cerrará tu sesión en este y en cualquier otro navegador o dispositivo donde hayas entrado con esta cuenta. Tendrás que volver a iniciar sesión."
                confirmLabel="Cerrar en todos"
                tone="danger"
                loading={isLoggingOut}
                onCancel={() => setShowLogoutEverywhere(false)}
                onConfirm={() =>
                    performLogout({
                        scope: 'global',
                        toastMessage: 'Sesión cerrada en todos los dispositivos',
                    })
                }
            />

            {showChangePassword && (
                <ChangePasswordModal
                    email={session.user.email ?? ''}
                    onClose={() => setShowChangePassword(false)}
                    onSuccess={() => {
                        setShowChangePassword(false);
                        toast.success('Contraseña actualizada.');
                    }}
                />
            )}

            {mobileNavOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => setMobileNavOpen(false)}
                        aria-hidden
                    />
                    <aside
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menú del panel"
                        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-admin-border bg-admin-surface shadow-2xl"
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-admin-border px-4 py-4">
                            <img
                                src={logoUrl}
                                alt="Churo Hogar"
                                className="h-16 w-auto max-w-[180px] object-contain object-left filter brightness-0 invert"
                            />
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setMobileNavOpen(false)}
                                aria-label="Cerrar menú"
                                className="rounded-lg p-2 text-admin-muted transition hover:bg-admin-surface-2 hover:text-admin-text"
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <nav className="admin-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Secciones del panel">
                            {renderNav(true)}
                        </nav>
                        <div className="space-y-1 border-t border-admin-border p-3">
                            <p className="truncate px-3 pb-2 text-xs text-admin-muted">{session.user.email}</p>
                            {renderSessionActions()}
                        </div>
                    </aside>
                </div>
            )}

            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-admin-border bg-admin-surface lg:flex">
                <div className="border-b border-admin-border px-5 py-5">
                    <img
                        src={logoUrl}
                        alt="Churo Hogar"
                        className="h-20 w-auto max-w-full object-contain object-left filter brightness-0 invert"
                    />
                </div>
                <nav className="admin-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Secciones del panel">
                    {renderNav()}
                </nav>
                <div className="space-y-1 border-t border-admin-border p-3">
                    <p className="truncate px-3 pb-2 text-xs text-admin-muted">{session.user.email}</p>
                    {renderSessionActions()}
                </div>
            </aside>

            <div className="flex min-h-screen flex-col lg:pl-64">
                <header className="sticky top-0 z-30 border-b border-admin-border bg-admin-bg/85 backdrop-blur">
                    <div className="flex items-center gap-3 px-4 py-3 md:px-8">
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Abrir menú"
                            className="rounded-lg border border-admin-border p-2 text-admin-muted transition hover:bg-admin-surface-2 hover:text-admin-text lg:hidden"
                        >
                            <FaBars />
                        </button>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-admin-muted">Panel administrativo</p>
                            <h1 className="truncate font-serif text-xl font-bold text-admin-text md:text-2xl">
                                {activeLabel}
                            </h1>
                        </div>
                    </div>
                </header>

            <main className="mx-auto w-full max-w-[1400px] flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">

                {activeTab === 'inmuebles' && (
                    <AdminPropertiesTab
                        adminId={session.user.id}
                        departamentos={departamentos}
                        ciudades={ciudades}
                        permisos={permisos}
                        legacy={legacy}
                        onProbarBusqueda={query => {
                            if (!puedeVerBusqueda) return;
                            setConsultaSemantica(query);
                            setActiveTab('busqueda');
                        }}
                    />
                )}

                {activeTab === 'ubicaciones' && (
                    <AdminLocationsTab
                        departamentos={departamentos}
                        ciudades={ciudades}
                        addDepartamento={addDepartamento}
                        renameDepartamento={renameDepartamento}
                        deleteDepartamento={deleteDepartamento}
                        fetchCiudades={fetchCiudades}
                        fetchDepartamentos={fetchDepartamentos}
                        addCiudad={addCiudad}
                        renameCiudad={renameCiudad}
                        deleteCiudad={deleteCiudad}
                        fetchBarrios={fetchBarrios}
                        addBarrio={addBarrio}
                        renameBarrio={renameBarrio}
                        deleteBarrio={deleteBarrio}
                        mergeBarrios={mergeBarrios}
                        permisos={permisos}
                        legacy={legacy}
                    />
                )}

                {activeTab === 'busqueda' && (
                    <AdminEmbeddingsTab
                        initialQuery={consultaSemantica}
                        permisos={permisos}
                        legacy={legacy}
                    />
                )}

                {activeTab === 'usuarios' && (
                    <AdminUsersTab
                        permisos={permisos}
                        miUserId={session.user.id}
                        legacy={legacy}
                    />
                )}

                {activeTab === 'roles' && (
                    <AdminRolesTab permisos={permisos} legacy={legacy} />
                )}

                {activeTab === 'sistema' && (
                    <AdminSystemTab permisos={permisos} legacy={legacy} />
                )}
            </main>
            </div>
        </div>
    );
};
