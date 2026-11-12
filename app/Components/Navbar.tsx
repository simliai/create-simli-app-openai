const links = [
  { label: "Documentation", href: "https://docs.simli.com" },
  { label: "Billing", href: "https://simli.com" },
  { label: "Discord", href: "https://discord.gg/yQx49zNF4d" },
];

export default function Navbar() {
  return (
    <div className="fixed bottom-[32px] left-[32px] z-50 w-full md:w-auto">
      <nav>
        <ul className="font-medium flex p-4 md:p-0 mt-4 border border-black rounded-lg bg-gray-50 md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0 md:bg-white dark:bg-black md:dark:bg-black">
          {links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block cursor-pointer py-2 px-3 text-gray-900 rounded md:border-0 md:p-0 dark:text-white hover:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
