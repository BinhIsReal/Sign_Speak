---
name: Liquid Communication System
colors:
  surface: '#f9f9ff'
  surface-dim: '#d7dae4'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3fe'
  surface-container: '#ebedf8'
  surface-container-high: '#e5e8f2'
  surface-container-highest: '#e0e2ed'
  on-surface: '#181c23'
  on-surface-variant: '#414754'
  inverse-surface: '#2d3038'
  inverse-on-surface: '#eef0fb'
  outline: '#717786'
  outline-variant: '#c0c6d6'
  surface-tint: '#005db7'
  primary: '#005bb3'
  on-primary: '#ffffff'
  primary-container: '#0073df'
  on-primary-container: '#fefcff'
  inverse-primary: '#a9c7ff'
  secondary: '#8300de'
  on-secondary: '#ffffff'
  secondary-container: '#9f32fe'
  on-secondary-container: '#fff6ff'
  tertiary: '#006482'
  on-tertiary: '#ffffff'
  tertiary-container: '#007ea4'
  on-tertiary-container: '#fbfdff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#00468c'
  secondary-fixed: '#f0dbff'
  secondary-fixed-dim: '#ddb7ff'
  on-secondary-fixed: '#2c0050'
  on-secondary-fixed-variant: '#6900b3'
  tertiary-fixed: '#bfe9ff'
  tertiary-fixed-dim: '#6dd2ff'
  on-tertiary-fixed: '#001f2a'
  on-tertiary-fixed-variant: '#004d65'
  background: '#f9f9ff'
  on-background: '#181c23'
  surface-variant: '#e0e2ed'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
---

## Brand & Style
The design system is centered on seamless, high-velocity communication. It prioritizes clarity, human connection, and a sense of "presence." The aesthetic is a refined take on modern minimalism, blending the approachable familiarity of instant messaging with a sophisticated, professional finish.

The style leverages **Modern Minimalism** with a hint of **Glassmorphism** for secondary UI layers. It creates an environment that feels lightweight yet structured, utilizing ample whitespace and soft depth to reduce cognitive load during dense conversations. The overall emotional response should be one of reliability, speed, and effortless interaction.

## Colors
The palette is dominated by "Messenger Blue," used strategically for primary actions and brand presence. A vibrant linear gradient provides depth to active states and message bubbles. 

- **Primary & Accents:** The blue is the core identifier, while Soft Purple is reserved for expressive accents or special thread categories.
- **Backgrounds:** Pure White is the default application canvas. Light Gray (#F0F2F5) is used for secondary surfaces like sidebar navigation or input field backgrounds to create subtle contrast.
- **Status:** A specific "Active Green" (#31A24C) is used exclusively for online status indicators to ensure high visibility against white and gray backgrounds.

## Typography
This design system utilizes **Inter** for its exceptional legibility and neutral, systematic feel. The type hierarchy is tight, with small increments between levels to maintain a compact, "chat-like" density.

- **Weight Strategy:** Headlines use Bold (700) or Semibold (600) to provide clear anchors in fast-scrolling views. Body text uses Regular (400) for maximum readability.
- **Contrast:** Deep Gray (#1C1E21) is applied to all primary text. Medium Gray (#65676B) is used for timestamps, secondary labels, and meta-data to create visual hierarchy through color rather than just size.

## Layout & Spacing
The layout follows a **Fluid Grid** model that prioritizes the horizontal space of chat threads. 

- **Messaging Rhythm:** Use a 4px baseline grid. Message bubbles are separated by 4px in a group, and 12px between different senders.
- **Desktop:** A three-pane architecture is standard: Navigation/Contacts (left), Active Conversation (center), and Thread Details (right).
- **Mobile:** Single-pane focus with 16px safe-area margins. Elements like cards and inputs stretch to the margins but retain the 16px internal padding for content.

## Elevation & Depth
Depth is used sparingly to maintain a "flat-modern" feel. 

- **Surface Layers:** Primary content sits on Level 0 (Pure White). Secondary surfaces like the contact list sit on Level 1 (Light Gray).
- **Shadows:** Use extremely soft, diffused shadows (Blur: 12px, Opacity: 4-6%) for cards and floating elements. 
- **Glassmorphism:** Floating captions and tooltips use a backdrop-blur (10px-15px) with 80% white opacity and a subtle 1px border in Messenger Blue to separate the element from the busy background content.

## Shapes
The shape language is defined by "Soft High-Radius" geometry.

- **Standard Containers:** A consistent 16px radius is applied to cards, modals, and primary containers.
- **Interactive Elements:** Buttons and tags utilize a fully rounded (pill) style to signify interactability and provide a tactile, friendly appearance. 
- **Message Bubbles:** Use 18px radius for the outer corners, with a smaller 4px radius on the tail-side to indicate the direction of the sender.

## Components
- **Buttons:** 
  - *Action Buttons:* Pill-shaped, using the primary gradient with white text.
  - *Call Controls:* Perfectly circular with centered icons; used for high-level actions like "Video Call" or "Add Image."
- **Cards:** White background, 16px corner radius, and Level 1 soft shadow. Used for shared links or media previews.
- **Chips/Filters:** Pill-shaped, Light Gray background, Medium Gray text. They transition to Primary Blue on active/selected states.
- **Status Indicators:** 12px circles for online status. Use a 2px white stroke when placed on top of avatars to ensure separation.
- **Input Fields:** 18px-24px rounded corners (semi-pill), Light Gray (#F0F2F5) background, no border except on focus (1px Primary Blue).
- **Captions:** Floating glassmorphic cards with 80% opacity, backdrop blur, and a thin 1px Messenger Blue outline to define the boundary.