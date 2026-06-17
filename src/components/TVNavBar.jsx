import { HomeIcon, SearchIcon, HistoryIcon, SettingsIcon, SourceIcon, LiveIcon } from "./Icons";
import RushFlixLogo from "./RushFlixLogo";

export default function TVNavBar({ page, onNavigate, onSearch, activeProfile, liveCountry, liveCategory, liveLanguage }) {
  const isPhone = window.screen.width < 1200;

  const items = [
    { id: "home",     label: "Home",    icon: <HomeIcon /> },
    { id: "search",   label: "Search",  icon: <SearchIcon />, action: onSearch },
    { id: "history",  label: "Library", icon: <HistoryIcon /> },
    { id: "live",     label: "Live TV", icon: <LiveIcon /> },
    ...(liveCountry ? [{
      id: "live-country",
      label: liveCountry,
      icon: <img
        src={`https://flagcdn.com/20x15/${liveCountry.toLowerCase()}.png`}
        alt={liveCountry}
        style={{ width: "1.5rem", height: "auto", borderRadius: 2, display: "block" }}
      />,
    }] : []),
    ...(liveCategory ? [{ id: "live-category", label: liveCategory, icon: <LiveIcon /> }] : []),
    ...(liveLanguage ? [{ id: "live-language", label: liveLanguage, icon: <LiveIcon /> }] : []),
    { id: "sources",  label: "Sources", icon: <SourceIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  ];

  return (
    <nav className="tv-navbar" data-block-exit="left right">
      <div className="tv-navbar-logo" aria-hidden="true">
        <RushFlixLogo size="sm" animate={false} />
      </div>
      <div className="tv-navbar-items">
        {items.map((item) => (
          <button
            key={item.id}
            className={`tv-navbar-btn tv-focusable${isPhone ? " tv-navbar-btn--icon-only" : ""} ${page === item.id ? "active" : ""}`}
            tabIndex={0}
            data-nav-active={page === item.id ? "true" : undefined}
            title={isPhone ? item.label : undefined}
            onClick={item.action ?? (() => onNavigate(item.id))}
          >
            <span className="tv-navbar-icon">{item.icon}</span>
            {!isPhone && <span className="tv-navbar-label">{item.label}</span>}
          </button>
        ))}
      </div>
      {activeProfile && (
        <button
          className="tv-navbar-profile tv-focusable"
          tabIndex={0}
          onClick={() => onNavigate("profiles")}
        >
          <span className="tv-navbar-avatar">{activeProfile.avatar}</span>
          <span className="tv-navbar-pname">{activeProfile.name}</span>
        </button>
      )}
    </nav>
  );
}
