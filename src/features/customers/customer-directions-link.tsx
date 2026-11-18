import type { MouseEvent } from "react";
import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import { customerDirectionsHref, preloadCustomerDirections, openCustomerDirections } from "./customer-directions";

export function confirmClosedCustomer(event: MouseEvent<HTMLAnchorElement>, customer: Pick<Customer, "name" | "status">) {
  event.stopPropagation();
  if (customer.status === "closed" && !window.confirm(`${customer.name}은(는) 폐업 처리된 거래처입니다. 계속 진행할까요?`)) event.preventDefault();
}

export function CustomerCardDirectionsLink({ customer, className, disabledClassName = className, label = "길안내" }: {
  customer: Customer; className?: string | undefined; disabledClassName?: string | undefined; label?: string;
}) {
  const href = customerDirectionsHref(customer);
  if (!href) return <span className={disabledClassName} aria-disabled="true"><Icon name="route" size={18} />주소 미등록</span>;
  const open = (event: MouseEvent<HTMLAnchorElement>) => { confirmClosedCustomer(event, customer); void openCustomerDirections(event, customer); };
  const prepare = () => preloadCustomerDirections(customer);
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer" onFocus={prepare} onPointerDown={prepare} data-directions-version={`${customer.customerId}:${customer.revision}`}
    aria-label={label === "길안내" ? `${customer.name} 납품지 길안내` : label} onClick={open}
    onAuxClick={(event) => { if (event.button === 1) open(event); }}><Icon name="route" size={18} />{label}</a>;
}
export default CustomerCardDirectionsLink;
