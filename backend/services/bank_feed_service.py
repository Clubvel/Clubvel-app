"""
Bank Feed Service for Clubvel App
Integrates with Stitch Money API for South African bank feed
Provides automatic payment detection and matching

Currently operates in MOCK mode until Stitch credentials are configured.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv
import re

load_dotenv()

logger = logging.getLogger(__name__)

# Configuration
STITCH_API_KEY = os.environ.get('STITCH_API_KEY')
STITCH_API_SECRET = os.environ.get('STITCH_API_SECRET')
STITCH_ENVIRONMENT = os.environ.get('STITCH_ENVIRONMENT', 'sandbox')
ENABLE_BANK_FEED = os.environ.get('ENABLE_BANK_FEED', 'false').lower() == 'true'

# Stitch Money URLs
STITCH_URLS = {
    'sandbox': 'https://sandbox.stitch.money',
    'production': 'https://api.stitch.money'
}


def is_stitch_configured() -> bool:
    """Check if Stitch credentials are configured"""
    return bool(STITCH_API_KEY and STITCH_API_SECRET)


def format_currency(amount: float) -> str:
    """Format amount as South African Rand"""
    return f"R{amount:,.2f}"


# ==================== MOCK DATA ====================

MOCK_BANK_ACCOUNTS = [
    {
        "id": "acc_001",
        "name": "Soshanguve Savings Club",
        "bank_name": "FNB",
        "account_number": "****1234",
        "account_type": "cheque",
        "current_balance": 15500.00,
        "available_balance": 15500.00,
        "currency": "ZAR",
        "linked_at": "2026-03-01T10:00:00Z"
    },
    {
        "id": "acc_002",
        "name": "Mamelodi Burial Society",
        "bank_name": "Capitec",
        "account_number": "****5678",
        "account_type": "savings",
        "current_balance": 8200.00,
        "available_balance": 8200.00,
        "currency": "ZAR",
        "linked_at": "2026-03-15T14:30:00Z"
    }
]

MOCK_TRANSACTIONS = [
    {
        "id": "txn_001",
        "account_id": "acc_001",
        "amount": 500.00,
        "currency": "ZAR",
        "reference": "THABO MOKOENA SSC APR",
        "description": "PAYMENT FROM THABO MOKOENA",
        "date": "2026-04-03T08:15:00Z",
        "transaction_type": "credit",
        "running_balance": 15500.00,
        "matched": True,
        "matched_member": "Thabo Mokoena"
    },
    {
        "id": "txn_002",
        "account_id": "acc_001",
        "amount": 500.00,
        "currency": "ZAR",
        "reference": "SIPHO DLAMINI CONTRIB",
        "description": "EFT FROM S DLAMINI",
        "date": "2026-04-01T14:30:00Z",
        "transaction_type": "credit",
        "running_balance": 15000.00,
        "matched": True,
        "matched_member": "Sipho Dlamini"
    },
    {
        "id": "txn_003",
        "account_id": "acc_001",
        "amount": 500.00,
        "currency": "ZAR",
        "reference": "UNKNOWN DEPOSIT",
        "description": "CASH DEPOSIT ATM",
        "date": "2026-04-05T11:45:00Z",
        "transaction_type": "credit",
        "running_balance": 16000.00,
        "matched": False,
        "matched_member": None
    },
    {
        "id": "txn_004",
        "account_id": "acc_002",
        "amount": 300.00,
        "currency": "ZAR",
        "reference": "NOMSA ZULU MBS",
        "description": "PAYMENT NOMSA ZULU BURIAL",
        "date": "2026-04-02T09:00:00Z",
        "transaction_type": "credit",
        "running_balance": 8200.00,
        "matched": True,
        "matched_member": "Nomsa Zulu"
    }
]


# ==================== PAYMENT MATCHING ====================

class PaymentMatcher:
    """
    Intelligent payment matching using fuzzy string matching
    Matches bank transactions to expected contributions
    """
    
    def __init__(self, tolerance_days: int = 5, amount_tolerance: float = 0.05):
        self.tolerance_days = tolerance_days
        self.amount_tolerance = amount_tolerance  # 5% tolerance
        
    def normalize_text(self, text: str) -> str:
        """Normalize text for comparison"""
        normalized = text.lower()
        normalized = re.sub(r'[^a-z0-9\s]', '', normalized)
        normalized = ' '.join(normalized.split())
        return normalized
    
    def calculate_name_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two strings (0-100)"""
        t1 = self.normalize_text(text1)
        t2 = self.normalize_text(text2)
        
        if not t1 or not t2:
            return 0.0
        
        # Simple word overlap scoring
        words1 = set(t1.split())
        words2 = set(t2.split())
        
        if not words1 or not words2:
            return 0.0
        
        common = words1.intersection(words2)
        total = words1.union(words2)
        
        return (len(common) / len(total)) * 100
    
    def calculate_amount_score(self, actual: float, expected: float) -> float:
        """Calculate amount match score (0-100)"""
        if expected == 0:
            return 0.0
        
        diff = abs(actual - expected)
        tolerance = expected * self.amount_tolerance
        
        if diff == 0:
            return 100.0
        elif diff <= tolerance:
            return 90.0
        elif diff <= (tolerance * 2):
            return 70.0
        else:
            return max(0, 100 - (diff / expected * 100))
    
    def calculate_date_score(self, transaction_date: datetime, due_date: datetime) -> float:
        """Calculate date match score (0-100)"""
        diff_days = abs((transaction_date - due_date).days)
        
        if diff_days == 0:
            return 100.0
        elif diff_days <= self.tolerance_days:
            return 100 - (diff_days * 10)
        elif diff_days <= (self.tolerance_days * 2):
            return 50.0
        else:
            return max(0, 100 - (diff_days * 5))
    
    def match_transaction(
        self,
        transaction: Dict[str, Any],
        member_name: str,
        expected_amount: float,
        due_date: datetime
    ) -> Tuple[float, str, Dict[str, float]]:
        """
        Match a single transaction against expected contribution
        
        Returns: (score, confidence_level, score_breakdown)
        """
        # Parse transaction data
        amount = transaction.get('amount', 0)
        description = f"{transaction.get('reference', '')} {transaction.get('description', '')}"
        
        tx_date_str = transaction.get('date', '')
        if tx_date_str:
            tx_date = datetime.fromisoformat(tx_date_str.replace('Z', '+00:00')).replace(tzinfo=None)
        else:
            tx_date = datetime.utcnow()
        
        # Calculate component scores
        name_score = self.calculate_name_similarity(description, member_name)
        amount_score = self.calculate_amount_score(amount, expected_amount)
        date_score = self.calculate_date_score(tx_date, due_date)
        
        # Weighted composite score
        # Amount is most important (45%), then name (35%), then date (20%)
        composite = (amount_score * 0.45) + (name_score * 0.35) + (date_score * 0.20)
        
        # Determine confidence level
        if composite >= 85:
            confidence = "high"
        elif composite >= 70:
            confidence = "medium"
        elif composite >= 50:
            confidence = "low"
        else:
            confidence = "no_match"
        
        breakdown = {
            "name_score": round(name_score, 1),
            "amount_score": round(amount_score, 1),
            "date_score": round(date_score, 1),
            "composite": round(composite, 1)
        }
        
        return composite, confidence, breakdown


# ==================== BANK FEED SERVICE ====================

class BankFeedService:
    """
    Service for managing bank feed connections and transactions
    """
    
    def __init__(self):
        self.matcher = PaymentMatcher()
    
    async def get_linked_accounts(self) -> Dict[str, Any]:
        """Get all linked bank accounts"""
        if not ENABLE_BANK_FEED or not is_stitch_configured():
            logger.info("[MOCK] Returning mock bank accounts")
            return {
                "success": True,
                "mock": True,
                "accounts": MOCK_BANK_ACCOUNTS
            }
        
        # TODO: Implement real Stitch API call
        # This would use GraphQL to fetch accounts
        try:
            # Real implementation would go here
            pass
        except Exception as e:
            logger.error(f"Failed to fetch accounts: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_account_balance(self, account_id: str) -> Dict[str, Any]:
        """Get balance for a specific account"""
        if not ENABLE_BANK_FEED or not is_stitch_configured():
            account = next(
                (a for a in MOCK_BANK_ACCOUNTS if a['id'] == account_id),
                None
            )
            if account:
                return {
                    "success": True,
                    "mock": True,
                    "account_id": account_id,
                    "current_balance": account['current_balance'],
                    "available_balance": account['available_balance'],
                    "currency": account['currency']
                }
            return {"success": False, "error": "Account not found"}
        
        # TODO: Implement real Stitch API call
        pass
    
    async def get_transactions(
        self,
        account_id: str,
        days_back: int = 30,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get transactions for an account"""
        if not ENABLE_BANK_FEED or not is_stitch_configured():
            cutoff = datetime.utcnow() - timedelta(days=days_back)
            transactions = [
                t for t in MOCK_TRANSACTIONS 
                if t['account_id'] == account_id
            ]
            logger.info(f"[MOCK] Returning {len(transactions)} mock transactions")
            return {
                "success": True,
                "mock": True,
                "account_id": account_id,
                "transactions": transactions,
                "count": len(transactions)
            }
        
        # TODO: Implement real Stitch API call with pagination
        pass
    
    async def sync_all_transactions(self, days_back: int = 30) -> Dict[str, Any]:
        """Sync transactions from all linked accounts"""
        results = []
        accounts_result = await self.get_linked_accounts()
        
        if not accounts_result.get('success'):
            return accounts_result
        
        for account in accounts_result.get('accounts', []):
            tx_result = await self.get_transactions(
                account['id'],
                days_back=days_back
            )
            results.append({
                "account_id": account['id'],
                "account_name": account['name'],
                "transaction_count": tx_result.get('count', 0),
                "success": tx_result.get('success', False)
            })
        
        return {
            "success": True,
            "mock": not is_stitch_configured(),
            "accounts_synced": len(results),
            "results": results
        }
    
    async def match_payment(
        self,
        transaction_id: str,
        member_name: str,
        expected_amount: float,
        due_date: datetime
    ) -> Dict[str, Any]:
        """
        Match a specific transaction to a contribution
        """
        # Find the transaction
        transaction = next(
            (t for t in MOCK_TRANSACTIONS if t['id'] == transaction_id),
            None
        )
        
        if not transaction:
            return {"success": False, "error": "Transaction not found"}
        
        score, confidence, breakdown = self.matcher.match_transaction(
            transaction,
            member_name,
            expected_amount,
            due_date
        )
        
        return {
            "success": True,
            "transaction_id": transaction_id,
            "member_name": member_name,
            "match_score": round(score, 1),
            "confidence": confidence,
            "breakdown": breakdown,
            "recommended_action": self._get_recommended_action(confidence)
        }
    
    async def auto_match_contributions(
        self,
        contributions: List[Dict[str, Any]],
        account_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Automatically match bank transactions to contributions
        
        Args:
            contributions: List of expected contributions with member_name, amount, due_date
            account_id: Optional specific account to match against
        """
        # Get all transactions
        if account_id:
            tx_result = await self.get_transactions(account_id)
            transactions = tx_result.get('transactions', [])
        else:
            all_transactions = []
            accounts_result = await self.get_linked_accounts()
            for account in accounts_result.get('accounts', []):
                tx_result = await self.get_transactions(account['id'])
                all_transactions.extend(tx_result.get('transactions', []))
            transactions = all_transactions
        
        # Match each contribution
        matches = {
            "high_confidence": [],
            "medium_confidence": [],
            "low_confidence": [],
            "no_match": []
        }
        
        matched_tx_ids = set()
        
        for contribution in contributions:
            best_match = None
            best_score = 0
            best_tx = None
            
            for tx in transactions:
                if tx['id'] in matched_tx_ids:
                    continue
                
                score, confidence, breakdown = self.matcher.match_transaction(
                    tx,
                    contribution['member_name'],
                    contribution['amount'],
                    contribution.get('due_date', datetime.utcnow())
                )
                
                if score > best_score:
                    best_score = score
                    best_match = {
                        "contribution": contribution,
                        "transaction": tx,
                        "score": round(score, 1),
                        "confidence": confidence,
                        "breakdown": breakdown
                    }
                    best_tx = tx
            
            if best_match and best_score >= 50:
                matches[f"{best_match['confidence']}_confidence" if best_match['confidence'] != "no_match" else "no_match"].append(best_match)
                if best_tx:
                    matched_tx_ids.add(best_tx['id'])
            else:
                matches["no_match"].append({
                    "contribution": contribution,
                    "transaction": None,
                    "score": 0,
                    "confidence": "no_match",
                    "breakdown": {}
                })
        
        return {
            "success": True,
            "mock": not is_stitch_configured(),
            "summary": {
                "total_contributions": len(contributions),
                "high_confidence_matches": len(matches["high_confidence"]),
                "medium_confidence_matches": len(matches["medium_confidence"]),
                "low_confidence_matches": len(matches["low_confidence"]),
                "unmatched": len(matches["no_match"])
            },
            "matches": matches
        }
    
    def _get_recommended_action(self, confidence: str) -> str:
        """Get recommended action based on confidence level"""
        actions = {
            "high": "AUTO_CONFIRM - Safe to automatically confirm payment",
            "medium": "REVIEW_RECOMMENDED - Manually verify before confirming",
            "low": "MANUAL_REVIEW - Requires treasurer review",
            "no_match": "NO_ACTION - No matching transaction found"
        }
        return actions.get(confidence, "UNKNOWN")


# ==================== HELPER FUNCTIONS ====================

async def get_bank_feed_status() -> Dict[str, Any]:
    """Get current bank feed service status"""
    return {
        "stitch_configured": is_stitch_configured(),
        "bank_feed_enabled": ENABLE_BANK_FEED,
        "environment": STITCH_ENVIRONMENT,
        "mode": "live" if ENABLE_BANK_FEED and is_stitch_configured() else "mock",
        "note": "Configure STITCH_API_KEY and STITCH_API_SECRET to enable real bank feed"
    }


# Create singleton instance
bank_feed_service = BankFeedService()
