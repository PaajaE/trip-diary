// components/icons/StarIcon.tsx
import React from "react";

const StarIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    viewBox="0 0 24 24"
    stroke="currentColor"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l2.062 6.341a1 1 0 00.95.69h6.462c.969 0 1.371 1.24.588 1.81l-5.234 3.788a1 1 0 00-.364 1.118l2.062 6.341c.3.921-.755 1.688-1.538 1.118l-5.234-3.788a1 1 0 00-1.176 0l-5.234 3.788c-.782.57-1.838-.197-1.538-1.118l2.062-6.341a1 1 0 00-.364-1.118L2.95 11.768c-.783-.57-.38-1.81.588-1.81h6.462a1 1 0 00.95-.69l2.062-6.341z"
    />
  </svg>
);

export default StarIcon;
