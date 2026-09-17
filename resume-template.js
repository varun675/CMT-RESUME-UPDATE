// Handlebars source for the CMT resume document. Kept as a JS string (rather
// than a fetched .hbs file) so the app works when opened directly via
// file:// as well as when served from GitHub Pages.
const RESUME_TEMPLATE_SOURCE = `
<div class="resume-doc">
  <div class="bar"></div>
  <div class="page">
    <aside class="sidebar">
      {{#if logoSrc}}
      <img class="logo" src="{{logoSrc}}" alt="CMT logo" crossorigin="anonymous" />
      {{else}}
      <div class="avatar"></div>
      {{/if}}
      <p class="name">{{displayName}}</p>
      <p class="role">{{title}}</p>
      {{#if contactLine}}
      <p class="contact">{{contactLine}}</p>
      {{/if}}

      {{#if summary}}
      <h2>Executive Summary</h2>
      <p class="summary-text">{{summary}}</p>
      {{/if}}

      {{#if education.length}}
      <h2>Education</h2>
      <ul class="list">
        {{#each education}}<li>{{this}}</li>{{/each}}
      </ul>
      {{/if}}

      {{#if certifications.length}}
      <h2>Certifications</h2>
      <ul class="list">
        {{#each certifications}}<li>{{this}}</li>{{/each}}
      </ul>
      {{/if}}
    </aside>

    <main class="main">
      {{#if experience.length}}
      <h2>Experience</h2>
      {{#each experience}}
      <div class="job">
        <div class="job-header">
          <span>{{displayTitle}}</span>
          <span class="job-dates">{{dates}}</span>
        </div>
        {{#if bullets.length}}
        <ul>
          {{#each bullets}}<li>{{this}}</li>{{/each}}
        </ul>
        {{/if}}
      </div>
      {{/each}}
      {{/if}}

      {{#if skillRows.length}}
      <div class="skills-section">
        <h2>Technical Skills</h2>
        <div class="skills-grid">
          {{#each skillRows}}
          <div class="skill-cell">
            <div class="skill-label">{{category}}</div>
            <div class="skill-items">{{items}}</div>
          </div>
          {{/each}}
        </div>
      </div>
      {{/if}}

      {{#if achievements.length}}
      <h2>Key Achievements</h2>
      <ul class="list">
        {{#each achievements}}<li>{{this}}</li>{{/each}}
      </ul>
      {{/if}}
    </main>
  </div>
  <div class="bar"></div>
</div>
`;
