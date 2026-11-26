import { Icon } from './Icon.jsx'

// The title card at the top of a page: icon, title, description and an optional action (a
// button) at the inline end. Same look as the queue and archive pages.
export function PageIntro({ icon, title, description, id, children }) {
  return (
    <section className="card page-intro" aria-labelledby={id}>
      <span className="page-intro__icon">
        <Icon name={icon} size={26} />
      </span>
      <div className="page-intro__text">
        <h2 id={id} className="page-intro__title">
          {title}
        </h2>
        <p className="page-intro__description">{description}</p>
      </div>
      {children}
    </section>
  )
}
