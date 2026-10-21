'use client';

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  Compass,
  Disc3,
  ExternalLink,
  Headphones,
  Heart,
  Library,
  LoaderCircle,
  LogOut,
  Menu,
  Music2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type {
  CatalogMode,
  Mode,
  Playlist,
  PublicUser,
  Recommendation,
  SearchResult,
  Track,
  Tag,
} from '@gyeol/contracts';

import { api, refresh, createSession, endSession, RequestError } from '../lib/api';

const minutes = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const uniqueTags = (tags: Tag[]) => [...new Map(tags.map((tag) => [tag.slug, tag])).values()];
const sourceSummary = (tags: Tag[]) =>
  [
    ...new Set(
      tags.map((g) => `${g.source} (${g.scope === 'recording' ? '곡' : '앨범·관련 정보'})`),
    ),
  ].join(' · ');
const moodList = ['전체', '몽환적인', '차분한', '따뜻한', '리드미컬한', '로맨틱한', '여유로운'];
const palette = [
  ['#bcc4ff', '#313f87', '#12162f'],
  ['#f4a787', '#8a4051', '#281b29'],
  ['#dbd896', '#557459', '#152821'],
  ['#b4d4ec', '#476c89', '#18263b'],
  ['#e6a2c6', '#7c3c69', '#251c31'],
  ['#d7efb5', '#5b7970', '#192f30'],
  ['#e6c789', '#9c5a2f', '#332719'],
  ['#c5a7f0', '#61458c', '#22192f'],
];
function Artwork({
  track,
  className = '',
  decorative = false,
}: {
  track: Pick<Track, 'palette' | 'title' | 'artworkUrl'>;
  className?: string;
  decorative?: boolean;
}) {
  const colors = palette[track.palette % palette.length];
  return (
    <div
      className={`artwork artwork-${track.palette % 4} ${className}`}
      style={{ '--art-a': colors[0], '--art-b': colors[1], '--art-c': colors[2] } as CSSProperties}
      aria-hidden={decorative || undefined}
    >
      {track.artworkUrl ? (
        <img
          src={track.artworkUrl}
          alt={decorative ? '' : `${track.title} 앨범 커버`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <>
          <div className="art-orbit" />
          <div className="art-orbit second" />
          <span className="art-kicker">GYEOL / SOUND STUDIES</span>
          <span className="art-title">{track.title}</span>
          <span className="art-edition">
            VOL. {String(track.palette + 1).padStart(2, '0')}
            <span>✳</span>
          </span>
        </>
      )}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function TrackCard({
  track,
  onSelect,
  onSave,
}: {
  track: Track;
  onSelect: (t: Track) => void;
  onSave: (t: Track) => void;
}) {
  return (
    <article className="track-card">
      <div className="card-image">
        <Artwork track={track} decorative />
        <button
          className="card-image-button"
          onClick={() => onSelect(track)}
          aria-label={`${track.title} 상세 보기`}
        >
          <span className="card-open">
            <ArrowUp size={20} />
          </span>
        </button>
      </div>
      <div className="track-card-line">
        <button className="track-title" onClick={() => onSelect(track)}>
          {track.title}
        </button>
        <button
          className="card-save"
          aria-label={`${track.title} 플레이리스트에 추가`}
          onClick={() => onSave(track)}
        >
          <Plus size={18} />
        </button>
      </div>
      <p>{track.artist}</p>
      <div className="card-tags">
        {uniqueTags(track.genres)
          .slice(0, 2)
          .map((g) => (
            <span key={g.slug}>{g.name}</span>
          ))}
      </div>
    </article>
  );
}

export default function Home() {
  const [nav, setNav] = useState<'discover' | 'search' | 'library'>('discover');
  const [tracks, setTracks] = useState<Track[]>([]),
    [catalogMode, setCatalogMode] = useState<CatalogMode>('demo');
  const [query, setQuery] = useState(''),
    [submitted, setSubmitted] = useState(''),
    [mood, setMood] = useState('전체');
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [cursor, setCursor] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null),
    [playlists, setPlaylists] = useState<Playlist[]>([]),
    [activeList, setActiveList] = useState<Playlist | null>(null);
  const [selected, setSelected] = useState<Track | null>(null),
    [recommendations, setRecommendations] = useState<Recommendation[]>([]),
    [recMode, setRecMode] = useState<Mode>('balanced'),
    [recLoading, setRecLoading] = useState(false),
    [recError, setRecError] = useState('');
  const [modal, setModal] = useState<'detail' | 'auth' | 'save' | 'create' | 'edit' | null>(null),
    [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [pendingTrack, setPendingTrack] = useState<Track | null>(null),
    [pendingMix, setPendingMix] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [formError, setFormError] = useState(''),
    [mobileMenu, setMobileMenu] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null),
    searchSequence = useRef(0),
    mixTracks = useRef<Track[]>([]);
  const notice = (text: string) => setMessage(text);
  async function loadTracks(term: string, next?: string) {
    const sequence = ++searchSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await api<SearchResult>(
        `search/tracks?q=${encodeURIComponent(term)}${next ? `&cursor=${next}` : ''}`,
      );
      if (sequence !== searchSequence.current) return;
      setTracks((old) =>
        next
          ? [...old, ...result.tracks.filter((t) => !old.some((o) => o.id === t.id))]
          : result.tracks,
      );
      setCatalogMode(result.mode);
      setCursor(result.nextCursor);
    } catch (error) {
      if (sequence === searchSequence.current) {
        setLoadError((error as Error).message);
        if (!next) setTracks([]);
      }
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  }
  async function loadPlaylists() {
    try {
      const result = await api<Playlist[]>('playlists');
      setPlaylists(result);
      return result;
    } catch (error) {
      notice((error as Error).message);
      return [];
    }
  }
  useEffect(() => {
    void loadTracks('');
    void refresh()
      .then((data) => setUser(data.user))
      .catch((error) => {
        if (error instanceof RequestError && error.status !== 401) setLoadError(error.message);
      });
  }, []);
  useEffect(() => {
    if (user) void loadPlaylists();
    else {
      setPlaylists([]);
      setActiveList(null);
    }
  }, [user]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setRecLoading(true);
    setRecError('');
    api<{ items: Recommendation[] }>(`tracks/${selected.id}/recommendations?mode=${recMode}`)
      .then((data) => {
        if (!cancelled) setRecommendations(data.items);
      })
      .catch((error) => {
        if (!cancelled) {
          setRecommendations([]);
          setRecError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setRecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, recMode]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener('backButton', () => {
      if (modal) setModal(null);
      else if (nav === 'library' && activeList) setActiveList(null);
      else if (nav !== 'discover') setNav('discover');
      else void CapacitorApp.minimizeApp();
    });
    return () => {
      void handle.then((listener) => listener.remove());
    };
  }, [modal, nav, activeList]);
  function navigate(next: typeof nav) {
    setNav(next);
    setMobileMenu(false);
    if (next === 'search') setTimeout(() => searchInput.current?.focus(), 0);
  }
  function openTrack(track: Track) {
    setSelected(track);
    setRecMode('balanced');
    setModal('detail');
    setFormError('');
  }
  function saveTrack(track: Track) {
    setPendingTrack(track);
    setPendingMix(false);
    setFormError('');
    setModal(user ? 'save' : 'auth');
  }
  async function signOut() {
    try {
      await endSession();
      setUser(null);
      setMobileMenu(false);
      setAuthMode('login');
      notice('로그아웃했어요.');
    } catch (error) {
      notice((error as Error).message);
    }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await createSession(authMode, {
        email: data.get('email'),
        password: data.get('password'),
        ...(authMode === 'register' ? { displayName: data.get('displayName') } : {}),
      });
      setUser(result.user);
      setModal(pendingMix ? 'create' : pendingTrack ? 'save' : null);
      notice(`${result.user.displayName}님, 반가워요.`);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const data = new FormData(event.currentTarget);
    try {
      const trackIds = pendingMix
        ? mixTracks.current.map((t) => t.id)
        : pendingTrack
          ? [pendingTrack.id]
          : [];
      const isEdit = modal === 'edit' && activeList;
      const result = await api<Playlist>(isEdit ? `playlists/${activeList.id}` : 'playlists', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          description: data.get('description'),
          ...(isEdit ? { version: activeList.version } : { trackIds }),
        }),
      });
      setActiveList(result);
      setPendingTrack(null);
      setPendingMix(false);
      setModal(null);
      setNav('library');
      await loadPlaylists();
      notice(isEdit ? '플레이리스트를 수정했어요.' : '새 플레이리스트가 만들어졌어요.');
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addToPlaylist(p: Playlist) {
    if (!pendingTrack) return;
    setBusy(true);
    setFormError('');
    try {
      const result = await api<Playlist>(`playlists/${p.id}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ trackId: pendingTrack.id }),
      });
      if (activeList?.id === result.id) setActiveList(result);
      await loadPlaylists();
      setModal(null);
      setPendingTrack(null);
      notice(`‘${p.name}’에 곡을 담았어요.`);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editOrder(index: number, direction: number) {
    if (!activeList) return;
    const ids = activeList.tracks.map((t) => t.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    setBusy(true);
    try {
      const result = await api<Playlist>(`playlists/${activeList.id}/order`, {
        method: 'PUT',
        body: JSON.stringify({ trackIds: ids, version: activeList.version }),
      });
      setActiveList(result);
      await loadPlaylists();
    } catch (error) {
      notice((error as Error).message);
      const lists = await loadPlaylists();
      setActiveList(lists.find((p) => p.id === activeList.id) || null);
    } finally {
      setBusy(false);
    }
  }
  async function removeTrack(track: Track) {
    if (!activeList) return;
    setBusy(true);
    try {
      setActiveList(
        await api<Playlist>(`playlists/${activeList.id}/tracks/${track.id}`, { method: 'DELETE' }),
      );
      await loadPlaylists();
      notice('플레이리스트에서 곡을 뺐어요.');
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deletePlaylist() {
    if (!activeList || !window.confirm(`‘${activeList.name}’ 플레이리스트를 삭제할까요?`)) return;
    setBusy(true);
    try {
      await api(`playlists/${activeList.id}`, { method: 'DELETE' });
      setActiveList(null);
      await loadPlaylists();
      notice('플레이리스트를 삭제했어요.');
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startMix() {
    if (!selected) return;
    mixTracks.current = [selected, ...recommendations.map((r) => r.track)].slice(0, 30);
    setPendingMix(true);
    setPendingTrack(null);
    setFormError('');
    setModal(user ? 'create' : 'auth');
  }
  const filtered = tracks.filter((t) => mood === '전체' || t.moods.some((m) => m.name === mood));
  const [heroA, heroB, heroC] = tracks;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => navigate('discover')} title="홈으로">
          <span className="brand-mark">g</span>
          <span>
            gyeol<span className="brand-dot">.</span>
          </span>
          <small>결</small>
        </button>
        <p className="nav-label">YOUR SOUND, YOUR WAY</p>
        <nav aria-label="주 메뉴">
          <button
            className={nav === 'discover' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('discover')}
          >
            <Compass size={20} />
            발견하기
            <span className="nav-dot" />
          </button>
          <button
            className={nav === 'search' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('search')}
          >
            <Search size={20} />
            노래 검색
          </button>
          <button
            className={nav === 'library' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('library')}
          >
            <Library size={20} />내 라이브러리
            {playlists.length > 0 && (
              <span className="nav-count" aria-hidden="true">
                {playlists.length}
              </span>
            )}
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-list-title">
          <span>MY PLAYLISTS</span>
          <button
            className="icon-button"
            aria-label="새 플레이리스트"
            onClick={() => {
              setPendingTrack(null);
              setPendingMix(false);
              setFormError('');
              setModal(user ? 'create' : 'auth');
            }}
          >
            <Plus size={17} />
          </button>
        </div>
        {playlists.slice(0, 6).map((p) => (
          <button
            className="sidebar-playlist"
            key={p.id}
            onClick={() => {
              setActiveList(p);
              navigate('library');
            }}
          >
            <span className="mini-cover">
              <Music2 size={16} />
            </span>
            <span>
              {p.name}
              <small>{p.tracks.length}곡</small>
            </span>
          </button>
        ))}
        {!playlists.length && (
          <p className="sidebar-empty">
            좋아하는 곡을 모아
            <br />
            나만의 결을 만들어 보세요.
          </p>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Headphones size={24} />
            <strong>취향은, 이어지니까.</strong>
            <p>
              한 곡의 발견이
              <br />
              새로운 세계가 되는 곳.
            </p>
            <span>MADE FOR YOUR EARS ↗</span>
          </div>
          <button
            className="account-button"
            onClick={() => {
              setPendingTrack(null);
              setPendingMix(false);
              setFormError('');
              if (user) void signOut();
              else setModal('auth');
            }}
          >
            <span className="avatar">
              <UserRound size={18} />
            </span>
            <span>
              {user ? user.displayName : '나의 취향 시작하기'}
              <small>{user ? '로그아웃' : '로그인 / 회원가입'}</small>
            </span>
            {user ? <LogOut size={17} /> : <ChevronRight size={17} />}
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              음악으로 이어지는 취향 <span>✳</span>
            </span>
          </div>
          <form
            className="search-form"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query);
              setMood('전체');
              setNav('search');
              void loadTracks(query);
            }}
          >
            <Search size={18} />
            <input
              ref={searchInput}
              aria-label="노래 또는 아티스트 검색"
              placeholder="어떤 노래를 좋아하세요?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={120}
            />
            <button type="submit" aria-label="검색 실행">
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="top-profile"
            aria-label={user ? '내 라이브러리' : '로그인'}
            onClick={() => {
              if (user) navigate('library');
              else {
                setPendingTrack(null);
                setPendingMix(false);
                setModal('auth');
                setFormError('');
              }
            }}
          >
            <UserRound size={19} />
          </button>
        </header>
        <main id="main-content">
          {nav === 'discover' && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span /> FIND YOUR NEXT FAVORITE
                  </span>
                  <h1>
                    좋아하는 한 곡에서,
                    <br />
                    새로운 <em>취향</em>으로.
                  </h1>
                  <p>
                    장르와 분위기로 이어지는 음악.
                    <br />
                    당신의 다음 플레이리스트를 발견해 보세요.
                  </p>
                  <button className="primary-button" onClick={() => navigate('search')}>
                    나의 취향 발견하기 <ArrowUp size={18} />
                  </button>
                  <div className="hero-caption">
                    <span className="caption-line" /> DIFFERENT SOUNDS. SAME FEELING.
                  </div>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="visual-grid" />
                  <span className="visual-orbit" />
                  <div className="visual-word">
                    feel
                    <br />
                    <i>the flow.</i>
                  </div>
                  {heroB && (
                    <div className="hero-record record-back">
                      <Artwork track={heroB} decorative />
                    </div>
                  )}
                  {heroA && (
                    <div className="hero-record record-front">
                      <Artwork track={heroA} decorative />
                      <span className="vinyl" />
                    </div>
                  )}
                  <div className="visual-label">
                    <span className="visual-star">✳</span>
                    <span>
                      좋은 음악에는
                      <br />
                      비슷한 결이 있어요.
                    </span>
                  </div>
                </div>
              </section>
              <div className="section-divider" />
            </>
          )}
          {nav !== 'library' && (
            <section className="discovery">
              <div className="section-heading">
                <div>
                  <span className="eyebrow muted">
                    {nav === 'search' ? 'SEARCH & DISCOVER' : 'A LITTLE MOOD, A LOT OF MUSIC'}
                  </span>
                  <h2>
                    {nav === 'search'
                      ? submitted
                        ? `‘${submitted}’ 검색 결과`
                        : '어떤 노래를 찾고 있나요?'
                      : '지금, 어떤 분위기인가요?'}
                    <span className="heading-star">✳</span>
                  </h2>
                  <p>
                    {nav === 'search'
                      ? '곡명, 아티스트 또는 장르로 새로운 음악을 만나보세요.'
                      : '오늘의 기분에 가까운 음악을 골라보세요.'}
                  </p>
                </div>
                <span className="mode-badge">
                  <span />
                  {catalogMode === 'demo' ? '샘플 체험' : '실제 곡 검색'}
                </span>
              </div>
              <div className="mood-row" role="group" aria-label="분위기 필터">
                {moodList.map((m, i) => (
                  <button
                    key={m}
                    aria-pressed={mood === m}
                    className={`mood-chip ${mood === m ? 'selected' : ''}`}
                    onClick={() => setMood(m)}
                  >
                    {i === 0 ? (
                      <SlidersHorizontal size={14} />
                    ) : (
                      <span aria-hidden="true">{['', '✧', '☾', '☀', '↗', '♡', '≈'][i]}</span>
                    )}
                    {m}
                  </button>
                ))}
              </div>
              {catalogMode === 'demo' && (
                <p className="demo-note">
                  <Disc3 size={15} />
                  가상 곡으로 검색·추천·저장을 체험할 수 있어요. 실제 아티스트의 곡이나 음원은
                  제공하지 않습니다.
                </p>
              )}
              {loadError ? (
                <div className="empty-state" role="alert">
                  <Music2 size={30} />
                  <h3>음악을 불러오지 못했어요</h3>
                  <p>{loadError}</p>
                  <button className="secondary-button" onClick={() => void loadTracks(submitted)}>
                    다시 시도
                  </button>
                </div>
              ) : loading && !tracks.length ? (
                <div className="track-grid" aria-label="음악 불러오는 중">
                  {[0, 1, 2, 3].map((n) => (
                    <div key={n} className="skeleton-card" />
                  ))}
                </div>
              ) : filtered.length ? (
                <>
                  <div className="track-grid">
                    {filtered.map((t) => (
                      <TrackCard key={t.id} track={t} onSelect={openTrack} onSave={saveTrack} />
                    ))}
                  </div>
                  {cursor && (
                    <button
                      className="secondary-button load-more"
                      disabled={loading}
                      onClick={() => void loadTracks(submitted, cursor)}
                    >
                      {loading ? '불러오는 중…' : '더 보기'}
                      <Plus size={16} />
                    </button>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>
                    {nav === 'search' && !submitted
                      ? '좋아하는 한 곡을 검색해 보세요'
                      : '아직 이 결의 음악을 찾지 못했어요'}
                  </h3>
                  <p>
                    {mood !== '전체'
                      ? '다른 분위기를 선택하거나 전체 음악을 살펴보세요.'
                      : '다른 곡명이나 아티스트 이름으로 다시 찾아보세요.'}
                  </p>
                </div>
              )}
            </section>
          )}
          {nav === 'discover' && (
            <section className="editorial">
              <div>
                <span className="eyebrow">THE ART OF DISCOVERY</span>
                <h2>
                  장르 너머,
                  <br />
                  나와 닮은 소리.
                </h2>
                <p>
                  왜 비슷한지 알면, 취향이 더 선명해져요.
                  <br />
                  곡을 눌러 장르와 추천 이유를 살펴보세요.
                </p>
                <button className="text-button" onClick={() => navigate('search')}>
                  음악 사이의 연결 찾기 <ArrowRight size={17} />
                </button>
              </div>
              <div className="editorial-art" aria-hidden="true">
                {heroC && <Artwork track={heroC} decorative />}
                <span className="editorial-ring" />
                <span className="editorial-script">
                  stay
                  <br />
                  curious.
                </span>
              </div>
            </section>
          )}
          {nav === 'library' && (
            <section className="library-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow muted">COLLECT YOUR FAVORITES</span>
                  <h1>
                    나의 플레이리스트<span className="heading-star">✳</span>
                  </h1>
                  <p>좋아하는 음악이 모여, 나만의 결이 되는 곳.</p>
                </div>
                <button
                  className="primary-button small"
                  onClick={() => {
                    setPendingTrack(null);
                    setPendingMix(false);
                    setFormError('');
                    setModal(user ? 'create' : 'auth');
                  }}
                >
                  <Plus size={17} />새 플레이리스트
                </button>
              </div>
              {!user ? (
                <div className="empty-state">
                  <Heart size={34} />
                  <h3>취향을 오래 간직해 보세요</h3>
                  <p>로그인하면 플레이리스트를 만들고 다시 만날 수 있어요.</p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setFormError('');
                      setModal('auth');
                    }}
                  >
                    로그인하기 <ArrowRight size={16} />
                  </button>
                </div>
              ) : activeList ? (
                <>
                  <button className="text-button back-button" onClick={() => setActiveList(null)}>
                    <ArrowLeft size={17} />
                    전체 플레이리스트
                  </button>
                  <div className="playlist-heading">
                    <div className="playlist-cover">
                      <Library size={48} />
                    </div>
                    <div>
                      <span className="eyebrow muted">MY PLAYLIST</span>
                      <h2>{activeList.name}</h2>
                      <p>{activeList.description || '좋아하는 음악을 차곡차곡 담아보세요.'}</p>
                      <small>
                        {activeList.tracks.length}곡 · {user.displayName}
                      </small>
                    </div>
                    <div className="playlist-actions">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setFormError('');
                          setModal('edit');
                        }}
                      >
                        이름 수정
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label="플레이리스트 삭제"
                        disabled={busy}
                        onClick={() => void deletePlaylist()}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="playlist-tracks">
                    {activeList.tracks.map((t, i) => (
                      <div className="playlist-row" key={t.id}>
                        <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                        <button className="row-song" onClick={() => openTrack(t)}>
                          <Artwork track={t} decorative />
                          <span>
                            <strong>{t.title}</strong>
                            <small>{t.artist}</small>
                          </span>
                        </button>
                        <span className="row-duration">{minutes(t.durationMs)}</span>
                        <button
                          className="icon-button"
                          disabled={busy || i === 0}
                          aria-label={`${t.title} 위로 이동`}
                          onClick={() => void editOrder(i, -1)}
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy || i === activeList.tracks.length - 1}
                          aria-label={`${t.title} 아래로 이동`}
                          onClick={() => void editOrder(i, 1)}
                        >
                          <ArrowDown size={17} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label={`${t.title} 목록에서 제거`}
                          onClick={() => void removeTrack(t)}
                        >
                          <X size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!activeList.tracks.length && (
                    <div className="empty-state">
                      <Music2 size={28} />
                      <h3>첫 번째 곡을 담아볼까요?</h3>
                      <button className="secondary-button" onClick={() => navigate('discover')}>
                        음악 발견하기
                      </button>
                    </div>
                  )}
                </>
              ) : playlists.length ? (
                <div className="playlist-grid">
                  {playlists.map((p) => (
                    <button className="playlist-tile" key={p.id} onClick={() => setActiveList(p)}>
                      <div className="playlist-tile-art">
                        {p.tracks[0] ? (
                          <Artwork track={p.tracks[0]} decorative />
                        ) : (
                          <Library size={42} />
                        )}
                        <span>
                          <Library size={20} />
                        </span>
                      </div>
                      <strong>{p.name}</strong>
                      <small>{p.tracks.length}곡</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Library size={32} />
                  <h3>첫 플레이리스트를 만들어 보세요</h3>
                  <p>곡 상세에서 + 버튼을 누르면 좋아하는 곡을 담을 수 있어요.</p>
                </div>
              )}
            </section>
          )}
          <footer>
            <span className="footer-brand">gyeol.</span>
            <span>음악과 취향 사이, 결.</span>
            <span>
              FIND YOUR OWN FREQUENCY <span>↗</span>
            </span>
          </footer>
        </main>
      </div>
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {modal === 'detail' && selected && (
        <Dialog title="노래의 결" onClose={() => setModal(null)} wide>
          <div className="detail-main">
            <Artwork track={selected} decorative />
            <div>
              <span className="eyebrow muted">
                {selected.isDemo ? 'FICTIONAL SAMPLE TRACK' : 'TRACK INSIGHT'}
              </span>
              <h2>{selected.title}</h2>
              <p className="detail-artist">{selected.artist}</p>
              <p className="detail-album">
                {selected.album} · {minutes(selected.durationMs)}
              </p>
              <div className="detail-tags">
                {uniqueTags(selected.genres).map((g) => (
                  <span key={g.slug}>{g.name}</span>
                ))}
              </div>
              <p className="genre-explanation">
                {selected.genres.some(
                  (g) => g.evidence === 'confirmed' && ['recording', 'curated'].includes(g.scope),
                )
                  ? `이 곡에 등록된 주요 장르는 ${uniqueTags(
                      selected.genres.filter((g) => g.evidence === 'confirmed'),
                    )
                      .map((g) => g.name)
                      .join(', ')}입니다.`
                  : selected.genres.length
                    ? `제공처 메타데이터에 ${uniqueTags(selected.genres)
                        .map((g) => g.name)
                        .join(', ')} 분류가 있어요. 이 곡의 세부 장르는 추가 확인이 필요해요.`
                    : '이 곡의 장르 정보가 아직 부족해요.'}
              </p>
              <div className="detail-moods">
                {uniqueTags(selected.moods).map((m) => (
                  <span key={m.slug}># {m.name}</span>
                ))}
              </div>
              <button className="primary-button" onClick={() => saveTrack(selected)}>
                <Plus size={17} />
                플레이리스트에 담기
              </button>
            </div>
          </div>
          <div className="source-note">
            <span>정보의 출처</span>
            <p>
              {selected.isDemo
                ? '가상 샘플 카탈로그 · 서비스 흐름을 위한 예시 분류입니다. 실제 음악의 분석 결과가 아닙니다.'
                : selected.genres.length
                  ? sourceSummary(selected.genres)
                  : '확인된 장르 출처가 없습니다.'}
            </p>
            {!selected.isDemo && (
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const data = await api<{ track: Track; enrichment: string }>(
                      `tracks/${selected.id}/enrich`,
                      { method: 'POST' },
                    );
                    setSelected(data.track);
                    notice(
                      data.enrichment === 'provider_unavailable'
                        ? '세부 장르 제공처에 연결할 수 없어요.'
                        : data.enrichment === 'no_exact_match'
                          ? '확실한 곡 단위 장르 정보를 찾지 못했어요.'
                          : '장르 정보를 확인했어요.',
                    );
                  } catch (error) {
                    notice((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                세부 장르 확인 <Sparkles size={14} />
              </button>
            )}
            {selected.genres.some((g) => g.scope === 'recording') && (
              <>
                <a
                  className="text-button"
                  href={
                    selected.genres.find((g) => g.scope === 'recording')?.sourceUrl ||
                    'https://musicbrainz.org'
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  MusicBrainz 곡 정보 <ExternalLink size={14} />
                </a>
                <a
                  className="text-button"
                  href="https://creativecommons.org/licenses/by-nc-sa/3.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  장르 데이터: CC BY-NC-SA 3.0
                </a>
              </>
            )}
            {selected.externalUrl && (
              <a
                className="text-button"
                href={selected.externalUrl}
                target="_blank"
                rel="noreferrer"
              >
                제공처에서 보기 <ExternalLink size={14} />
              </a>
            )}
          </div>
          <div className="recommend-heading">
            <div>
              <span className="eyebrow muted">SAME FEELING, NEW SOUNDS</span>
              <h3>비슷한 결의 노래</h3>
            </div>
            <select
              aria-label="추천 기준"
              value={recMode}
              onChange={(e) => setRecMode(e.target.value as Mode)}
            >
              <option value="balanced">장르 + 분위기</option>
              <option value="genre">장르 중심</option>
              <option value="mood">분위기 중심</option>
            </select>
          </div>
          {recLoading ? (
            <p className="muted-text">비슷한 음악을 찾고 있어요…</p>
          ) : recError ? (
            <p role="alert">{recError}</p>
          ) : recommendations.length ? (
            <>
              <div className="recommend-list">
                {recommendations.slice(0, 6).map((r) => (
                  <div key={r.track.id} className="recommend-row">
                    <button onClick={() => openTrack(r.track)} className="row-song">
                      <Artwork track={r.track} decorative />
                      <span>
                        <strong>{r.track.title}</strong>
                        <small>{r.track.artist}</small>
                        <span className="recommend-reason">{r.reasons[0]}</span>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${r.track.title} 추천곡 추가`}
                      onClick={() => saveTrack(r.track)}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="secondary-button mix-button" onClick={startMix}>
                <Sparkles size={16} />이 결로 플레이리스트 만들기
              </button>
            </>
          ) : (
            <p className="empty-inline">
              아직 비교할 수 있는 곡 단위 태그가 충분하지 않아요. 추천 후보가 쌓이면 여기서 만날 수
              있어요.
            </p>
          )}
        </Dialog>
      )}
      {modal === 'auth' && (
        <Dialog
          title={authMode === 'login' ? '다시 만나 반가워요' : '당신의 취향을 시작해요'}
          onClose={() => setModal(null)}
        >
          <p className="dialog-subtitle">좋아하는 음악을 모아, 나만의 결로.</p>
          <div className="auth-tabs">
            <button
              aria-pressed={authMode === 'login'}
              onClick={() => {
                setAuthMode('login');
                setFormError('');
              }}
            >
              로그인
            </button>
            <button
              aria-pressed={authMode === 'register'}
              onClick={() => {
                setAuthMode('register');
                setFormError('');
              }}
            >
              회원가입
            </button>
          </div>
          <form className="stack-form" onSubmit={authenticate} key={authMode}>
            {authMode === 'register' && (
              <label>
                이름
                <input
                  name="displayName"
                  autoComplete="nickname"
                  placeholder="어떻게 불러드릴까요?"
                  required
                  maxLength={40}
                />
              </label>
            )}
            <label>
              이메일
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                placeholder="10자 이상의 비밀번호"
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : authMode === 'login' ? (
                '로그인'
              ) : (
                '회원가입'
              )}
              <ArrowRight size={16} />
            </button>
            <p className="form-footnote">
              현재 개발용 MVP입니다. 공개 출시 전 이메일 인증·계정 복구 기능이 추가됩니다.
            </p>
          </form>
        </Dialog>
      )}
      {modal === 'save' && (
        <Dialog title="어디에 담아볼까요?" onClose={() => setModal(null)}>
          <p className="dialog-subtitle">
            {pendingTrack?.title} · {pendingTrack?.artist}
          </p>
          <div className="save-options">
            {playlists.map((p) => (
              <button key={p.id} disabled={busy} onClick={() => void addToPlaylist(p)}>
                <span className="mini-cover">
                  <Library size={19} />
                </span>
                <span>
                  {p.name}
                  <small>{p.tracks.length}곡</small>
                </span>
                <Plus size={18} />
              </button>
            ))}
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button
            className="secondary-button full-width"
            disabled={busy}
            onClick={() => {
              setFormError('');
              setModal('create');
            }}
          >
            <Plus size={16} />새 플레이리스트에 담기
          </button>
        </Dialog>
      )}
      {(modal === 'create' || modal === 'edit') && (
        <Dialog
          title={modal === 'edit' ? '플레이리스트 수정' : '새로운 취향의 시작'}
          onClose={() => setModal(null)}
        >
          <p className="dialog-subtitle">
            {pendingMix
              ? `비슷한 결의 ${mixTracks.current.length}곡을 함께 담을게요.`
              : pendingTrack
                ? `‘${pendingTrack.title}’ 곡을 함께 담을게요.`
                : '당신만의 플레이리스트에 이름을 붙여주세요.'}
          </p>
          <form className="stack-form" onSubmit={createPlaylist}>
            <label>
              플레이리스트 이름
              <input
                name="name"
                placeholder="예: 새벽 두 시의 재즈"
                maxLength={80}
                required
                defaultValue={
                  modal === 'edit' ? activeList?.name : pendingMix ? `${selected?.title}의 결` : ''
                }
              />
            </label>
            <label>
              설명 <span className="muted-text">선택</span>
              <textarea
                name="description"
                placeholder="어떤 순간에 듣고 싶은가요?"
                maxLength={500}
                rows={3}
                defaultValue={modal === 'edit' ? activeList?.description : ''}
              />
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : modal === 'edit' ? (
                '수정 저장'
              ) : (
                '플레이리스트 만들기'
              )}
              <ArrowRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
